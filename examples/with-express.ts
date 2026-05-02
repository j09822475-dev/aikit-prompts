/**
 * @aikit/prompts — Express + filesystem hot-reload.
 *
 * Demonstrates the Node-side pattern: prompts live in a directory of
 * `*.json` files (so PM/ML can edit them without a redeploy), `fsSource`
 * watches the directory, and the registry serves the latest version
 * matching a SemVer range. Anthropic's request shape is built via
 * `toAnthropic(...)` — including cache-control breakpoints on the
 * static system block so subsequent requests reuse the cached prefix.
 *
 * The Anthropic client is replaced with a stub so the example runs
 * without an API key. Run: npx tsx examples/with-express.ts
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { block, compose, fromJSON } from '@aikit/prompts';
import { toAnthropic } from '@aikit/prompts/adapters/anthropic';
import { fsSource } from '@aikit/prompts/sources/fs';
import { createRegistry } from '@aikit/prompts/versioning';
import express, { type Request, type Response } from 'express';

// ── Lay down a temporary prompts/ directory ────────────────────────────────

const dir = mkdtempSync(join(tmpdir(), 'aikit-prompts-example-'));
const v1Path = join(dir, 'answer.qa.v1.json');
writeFileSync(
  v1Path,
  JSON.stringify({
    id: 'answer.qa',
    version: '1.0.0',
    template:
      'You are a {{persona}}. Answer concisely and cite sources where relevant.\n\nQuestion: {{question}}',
    partial: { persona: 'senior staff engineer' },
    metadata: {},
    tags: [],
  }),
);

// ── Wire the registry to the directory ────────────────────────────────────

const registry = createRegistry();

registry.addSource(
  fsSource({
    glob: `${dir}/**/*.json`,
    watch: true,
    debounceMs: 50,
  }),
);

// Wait for the initial scan to settle.
await new Promise<void>((resolve, reject) => {
  const off = registry.on('change', (e) => {
    if (e.type === 'added' || e.type === 'replaced') {
      off();
      resolve();
    } else if (e.type === 'error') {
      off();
      reject(e.error);
    }
  });
});

// ── Build a Composition that wraps the registry-loaded prompt ──────────────

const buildAnswerComposition = (rangeSelector: string) => {
  const def = registry.get('answer.qa', rangeSelector);

  // Cache the static system instruction; only the question varies per request.
  const systemBlock = block('system')
    .template('You are {{persona}}. Reply concisely.')
    .partial({ persona: 'a senior staff engineer who cites sources' })
    .cacheBreakpoint()
    .build();

  // Re-hydrate the registry definition into a typed prompt, then drop it
  // into a user block so the composition's `cacheBreakpoint` plays nicely.
  const userBlock = block('user')
    .template(fromJSON(def.toJSON()).template)
    .build();

  return compose([systemBlock, userBlock], {
    id: 'answer.qa.composed',
    version: def.version,
  });
};

// ── Stub Anthropic client: echo back the request shape ─────────────────────

interface StubAnthropic {
  messages: {
    create: (params: ReturnType<typeof toAnthropic> & { model: string }) => Promise<{
      content: Array<{ type: 'text'; text: string }>;
      cacheBlocks: number;
    }>;
  };
}

const stubAnthropic: StubAnthropic = {
  messages: {
    create: async (params) => {
      const cached = (params.system ?? []).filter(
        (b) => 'cache_control' in b,
      ).length;
      return {
        content: [
          {
            type: 'text',
            text: `(stub) model=${params.model} system_blocks=${(params.system ?? []).length} cached=${cached} turns=${params.messages.length}`,
          },
        ],
        cacheBlocks: cached,
      };
    },
  },
};

// ── Express app ────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.post('/answer', async (req: Request, res: Response) => {
  const body = req.body as {
    persona: string;
    question: string;
    range?: string;
  };
  const composition = buildAnswerComposition(body.range ?? '^1.0.0');

  const params = toAnthropic(composition, {
    persona: body.persona,
    question: body.question,
  });
  const result = await stubAnthropic.messages.create({
    ...params,
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 1024,
  } as ReturnType<typeof toAnthropic> & { model: string });

  res.json({
    text: result.content[0]?.text,
    cacheBlocks: result.cacheBlocks,
    promptVersion: composition.version,
  });
});

const server = app.listen(0);
const port = (server.address() as { port: number }).port;

const callOnce = async (label: string) => {
  const r = await fetch(`http://localhost:${port}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      persona: 'senior staff engineer',
      question: 'Why prefer composition over inheritance?',
    }),
  });
  console.log(`${label}:`, await r.json());
};

console.log('--- initial request (v1.0.0) ---');
await callOnce('  initial');

// ── Simulate a hot-reload: write v1.1.0 to the watched directory ───────────

console.log('\n--- writing v1.1.0 to disk ---');
const v11Path = join(dir, 'answer.qa.v1_1.json');
writeFileSync(
  v11Path,
  JSON.stringify({
    id: 'answer.qa',
    version: '1.1.0',
    template:
      'You are a {{persona}} optimizing for clarity. Answer in ≤ 80 words and cite at most one source.\n\nQuestion: {{question}}',
    partial: { persona: 'senior staff engineer' },
    metadata: {},
    tags: [],
  }),
);

// Wait for fsSource debounce + registry update.
await new Promise<void>((resolve) => {
  const off = registry.on('change', (e) => {
    if (
      (e.type === 'added' || e.type === 'replaced') &&
      e.id === 'answer.qa' &&
      e.version === '1.1.0'
    ) {
      off();
      resolve();
    }
  });
});

console.log('--- after hot-reload (^1.0.0 picks 1.1.0) ---');
await callOnce('  reloaded');

// ── Cleanup ────────────────────────────────────────────────────────────────

server.close();
await registry.dispose();
rmSync(dir, { recursive: true, force: true });
