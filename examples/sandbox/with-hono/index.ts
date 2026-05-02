/**
 * @aikit/prompts — Hono on the edge (Cloudflare Workers / Bun / Deno).
 *
 * A single Hono app exposes two endpoints:
 *
 *   POST /summarize  — uses `toAISDK` to drive the Vercel AI SDK
 *                      (`generateText`) with a typed prompt.
 *   POST /classify   — runs a deterministic A/B split between two prompt
 *                      variants and returns which variant served the
 *                      request, so you can correlate outcome metrics
 *                      with the variant id.
 *
 * The model is replaced with a stub language-model that echoes the
 * incoming prompt — no API key, no network, fully runnable end-to-end.
 *
 * Run: npx tsx examples/with-hono.ts
 */

import { prompt } from '@aikit/prompts';
import { toAISDK } from '@aikit/prompts/adapters/ai-sdk';
import { createABTest, stickyUserOrSession } from '@aikit/prompts/testing';
import { generateText, type LanguageModelV1 } from 'ai';
import { Hono } from 'hono';

// ── Prompts ────────────────────────────────────────────────────────────────

const summarize = prompt('summarize.long')
  .version('1.0.0')
  .template('Summarize the following in {{maxWords:number}} words:\n\n{{text}}')
  .build();

const classifyControl = prompt('classify.intent')
  .version('1.0.0')
  .template(
    'Classify the user message intent as one of: question | request | complaint | other. Reply with one word only.\n\nMessage: {{message}}',
  )
  .build();

const classifyTreatment = prompt('classify.intent')
  .version('1.1.0')
  .template(
    'You are an intent classifier. Categories: question, request, complaint, other.\nRespond with exactly one category word, lowercase.\n\nUser message: """{{message}}"""',
  )
  .build();

const classifyTest = createABTest({
  name: 'classify-intent-2026-q2',
  variants: [
    { id: 'control',   prompt: classifyControl,   weight: 50 },
    { id: 'treatment', prompt: classifyTreatment, weight: 50 },
  ],
  identifier: stickyUserOrSession,
});

// ── Stub model: implements just enough of LanguageModelV1 for `generateText` ─

const stubModel = (label: string): LanguageModelV1 => ({
  specificationVersion: 'v1',
  provider: 'stub',
  modelId: label,
  defaultObjectGenerationMode: undefined,
  doGenerate: async ({ prompt: messages }) => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const text =
      lastUser && Array.isArray(lastUser.content)
        ? lastUser.content
            .map((p) => (p.type === 'text' ? p.text : ''))
            .join('')
        : '';
    return {
      text: `[${label}] echoed ${text.length} chars`,
      finishReason: 'stop',
      usage: { promptTokens: text.length / 4, completionTokens: 16 },
      rawCall: { rawPrompt: null, rawSettings: {} },
    };
  },
  doStream: async () => ({
    stream: new ReadableStream(),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
});

// ── App ────────────────────────────────────────────────────────────────────

const app = new Hono();

app.post('/summarize', async (c) => {
  const body = (await c.req.json()) as { text: string; maxWords?: number };
  const args = toAISDK(summarize, {
    text: body.text,
    maxWords: body.maxWords ?? 50,
  });
  const { text } = await generateText({
    model: stubModel('summarizer'),
    ...args,
  });
  return c.json({ summary: text, prompt: { id: summarize.id, version: summarize.version } });
});

app.post('/classify', async (c) => {
  const body = (await c.req.json()) as { message: string; userId?: string };
  const assignment = classifyTest.assign({ userId: body.userId });
  if (assignment.kind !== 'variant') {
    // Fall back to the control prompt if the visitor cannot be bucketed
    // (e.g. no user id, holdout). Real apps would log `assignment.kind`.
    const args = toAISDK(classifyControl, { message: body.message });
    const { text } = await generateText({ model: stubModel('control'), ...args });
    return c.json({ intent: text, variant: assignment.kind, version: classifyControl.version });
  }

  const args = toAISDK(assignment.prompt, { message: body.message });
  const { text } = await generateText({
    model: stubModel(`classify:${assignment.id}`),
    ...args,
  });
  return c.json({ intent: text, variant: assignment.id, version: assignment.prompt.version });
});

// ── Demo: hit each endpoint via `app.request(...)` ─────────────────────────

const summarizeRes = await app.request('/summarize', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    text: 'TypeScript is a statically typed superset of JavaScript that compiles to plain JavaScript and adds optional types, classes, and modules.',
    maxWords: 12,
  }),
});
console.log('--- POST /summarize ---');
console.log('status:', summarizeRes.status);
console.log('body  :', await summarizeRes.json());

console.log('\n--- POST /classify (5 different users) ---');
for (const userId of ['alice', 'bob', 'carol', 'dave', 'eve']) {
  const res = await app.request('/classify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Where is my refund?', userId }),
  });
  const json = (await res.json()) as { variant: string; version: string };
  console.log(`${userId.padEnd(6)} → ${json.variant.padEnd(10)} (v${json.version})`);
}
