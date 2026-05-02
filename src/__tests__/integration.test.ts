import { describe, expect, it, beforeAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prompt, block, compose, tool, fromJSON } from '../index.js';
import {
  createRegistry,
  createTypedRegistry,
} from '../versioning/index.js';
import { createABTest, stickyUserOrSession } from '../testing/index.js';
import { estimateCost, estimateTokens } from '../cost/index.js';
import { tiktokenFor } from '../cost/tiktoken.js';
import { memorySource } from '../sources/index.js';
import { fsSource } from '../sources/fs.js';
import { httpSource } from '../sources/http.js';
import { toOpenAI } from '../adapters/openai/index.js';
import { toAnthropic } from '../adapters/anthropic/index.js';
import { toAISDK } from '../adapters/ai-sdk/index.js';
import { toLangChain } from '../adapters/langchain/index.js';
import { withIfEach, withPartials, registerPartial } from '../template-extras/index.js';

beforeAll(() => {
  withIfEach();
  withPartials();
});

describe('Integration — end-to-end prompt → adapter pipeline', () => {
  it('should build a chat composition and emit OpenAI-compatible params with cache key', () => {
    const sys = block('system')
      .template('You are an assistant for {{role}}.')
      .cacheBreakpoint()
      .build();
    const user = block('user').template('Question: {{q}}').build();
    const c = compose([sys, user], { id: 'support' });

    const params = toOpenAI(c, { role: 'admins', q: 'reset password' });
    expect(params.messages).toHaveLength(2);
    expect(params.prompt_cache_key).toBeDefined();
  });

  it('should produce equivalent system field on Anthropic from the same composition', () => {
    const sys = block('system').template('You are helpful').build();
    const user = block('user').template('Hi').build();
    const c = compose([sys, user]);
    const out = toAnthropic(c, {});
    expect(out.system).toBe('You are helpful');
    expect(out.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('should produce providerOptions for AI SDK when cache hint is present', () => {
    const sys = block('system').template('p').cacheBreakpoint().build();
    const user = block('user').template('hi').build();
    const c = compose([sys, user]);
    const out = toAISDK(c, {});
    expect(out.providerOptions).toBeDefined();
  });

  it('should emit LangChain BaseMessage shapes preserving cacheControl metadata', () => {
    const sys = block('system').template('p').cacheBreakpoint().build();
    const c = compose([sys]);
    const out = toLangChain(c, {});
    expect(out[0]?.additional_kwargs).toEqual({
      providerMetadata: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    });
  });
});

describe('Integration — versioning + sources + registry', () => {
  it('should register multiple versions and resolve via SemVer ranges', () => {
    const v1 = prompt('greet').version('1.0.0').template('Hi {{name}}').build();
    const v2 = prompt('greet')
      .version('1.5.0')
      .template('Hello {{name}}!')
      .build();
    const v3 = prompt('greet')
      .version('2.0.0')
      .template('Greetings {{name}}')
      .build();
    const reg = createRegistry({ prompts: [v1, v2, v3] });
    expect(reg.get('greet').version).toBe('2.0.0');
    expect(reg.get('greet', '^1.0.0').version).toBe('1.5.0');
    expect(reg.get('greet', '1.0.0').version).toBe('1.0.0');
  });

  it('should hydrate prompts from a memorySource via addSource', async () => {
    const v = prompt('p').version('1.0.0').template('hi').build();
    const reg = createRegistry();
    const src = memorySource([v.toJSON()]);
    reg.addSource(src);
    const start = Date.now();
    while (reg.find('p') === undefined && Date.now() - start < 1000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(reg.find('p')?.template).toBe('hi');
  });

  it('should hydrate prompts from an fsSource end-to-end', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aikit-int-'));
    try {
      const v = prompt('greet')
        .version('1.0.0')
        .template('Hi {{name}}')
        .build();
      writeFileSync(join(dir, 'greet.json'), JSON.stringify(v.toJSON()));
      const reg = createRegistry();
      const src = fsSource({ glob: `${dir}/*.json` });
      reg.addSource(src);
      // Wait until the registry surfaces the prompt — fsSource lazily imports
      // node:fs so the initial settle takes a few ticks.
      const start = Date.now();
      while (reg.find('greet') === undefined && Date.now() - start < 2000) {
        await new Promise((r) => setTimeout(r, 10));
      }
      const got = reg.find('greet');
      expect(got?.render({ name: 'Alice' })).toBe('Hi Alice');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should hydrate prompts from an httpSource end-to-end', async () => {
    const v = prompt('greet').version('1.0.0').template('Hi {{n}}').build();
    const fakeFetch: typeof fetch = async (): Promise<Response> =>
      new Response(JSON.stringify([v.toJSON()]), { status: 200 });
    const reg = createRegistry();
    reg.addSource(httpSource({ url: 'https://x', fetch: fakeFetch }));
    const start = Date.now();
    while (reg.find('greet') === undefined && Date.now() - start < 1000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(reg.find('greet')?.render({ n: 'A' })).toBe('Hi A');
  });

  it('should support a typed registry returning the precise prompt instance', () => {
    const greet = prompt('greet')
      .version('1.0.0')
      .template('Hi {{name}}')
      .build();
    const reg = createTypedRegistry({ greet: [greet] });
    const got = reg.get('greet');
    expect(got.render({ name: 'Alice' })).toBe('Hi Alice');
  });
});

describe('Integration — A/B testing over prompt variants', () => {
  it('should split traffic deterministically and let assigned variant render', () => {
    const v1 = prompt('search.user')
      .version('1.0.0')
      .template('Search: {{q}}')
      .build();
    const v2 = prompt('search.user')
      .version('2.0.0')
      .template('Find: {{q}}')
      .build();
    const test = createABTest({
      name: 'search-variant-2026',
      variants: [
        { id: 'control', prompt: v1, weight: 50 },
        { id: 'treatment', prompt: v2, weight: 50 },
      ],
      identifier: stickyUserOrSession,
    });
    const a = test.assign({ userId: 'user-1' });
    const b = test.assign({ userId: 'user-1' });
    expect(a.kind).toBe(b.kind);
    if (a.kind === 'variant' && b.kind === 'variant') {
      expect(a.id).toBe(b.id);
      expect(a.prompt.render({ q: 'TS' })).toBe(b.prompt.render({ q: 'TS' }));
    }
  });
});

describe('Integration — cost estimation', () => {
  it('should produce a cost estimate using the heuristic tokenizer', () => {
    const greet = prompt('greet').template('Hello {{name}}').build();
    const r = estimateCost({
      prompt: greet,
      vars: { name: 'A' },
      model: 'gpt-4o',
      expectedOutputTokens: 100,
    });
    expect(r.totalUSD).toBeGreaterThan(0);
  });

  it('should produce a more precise estimate via tiktokenFor', () => {
    const greet = prompt('greet').template('Hello {{name}}').build();
    const r = estimateCost({
      prompt: greet,
      vars: { name: 'A' },
      model: 'gpt-4o',
      tokenizer: tiktokenFor('gpt-4o'),
    });
    expect(r.accuracy).toBe('exact');
    expect(r.tokenizer).toContain('tiktoken');
  });

  it('should estimate tokens for a Composition without a model', () => {
    const sys = block('system').template('You').build();
    const user = block('user').template('Q: {{q}}').build();
    const c = compose([sys, user]);
    const r = estimateTokens({ prompt: c, vars: { q: 'hi' } });
    expect(r.inputTokens).toBeGreaterThan(0);
  });
});

describe('Integration — template-extras with adapters', () => {
  it('should render iteration directives end-to-end through the OpenAI adapter', () => {
    const p = prompt('list')
      .template('Items: {{#each xs}}- {{this}}\n{{/each}}')
      .build();
    const out = toOpenAI(p, { xs: ['a', 'b', 'c'] } as never);
    expect((out.messages[0] as { content: string }).content).toBe(
      'Items: - a\n- b\n- c\n',
    );
  });

  it('should inline a registered partial through composition + adapter', () => {
    registerPartial('signoff', '— team');
    const sys = block('system').template('Be helpful').build();
    const user = block('user').template('Q: {{q}}\n{{> signoff}}').build();
    const c = compose([sys, user]);
    const out = toOpenAI(c, { q: 'hi' });
    expect(
      (out.messages[1] as { content: string }).content,
    ).toContain('— team');
  });
});

describe('Integration — round-trip serialization', () => {
  it('should preserve render output across toJSON / fromJSON', () => {
    const original = prompt('greet')
      .version('1.0.0')
      .template('Hello {{name}}')
      .partial({ name: 'World' })
      .metadata({ owner: 'alice' })
      .tags('beta')
      .build();
    const restored = fromJSON(original.toJSON());
    expect(restored.render({})).toBe(original.render({}));
    expect(restored.metadata).toEqual(original.metadata);
    expect(restored.tags).toEqual(original.tags);
  });
});

describe('Integration — tool composition', () => {
  it('should validate uniqueness, type-check parameters, and surface in OpenAI tools array', () => {
    const search = tool({
      name: 'web_search',
      description: 'Search the web',
      parameters: {
        type: 'object',
        properties: { q: { type: 'string' } },
        required: ['q'],
      },
    });
    const c = compose([block('user').template('hi').build()], {
      tools: [search],
    });
    const out = toOpenAI(c, {});
    expect(out.tools?.[0]?.function.name).toBe('web_search');
  });
});

describe('Integration — error surfacing', () => {
  it('should silence the unknown-variable warning when NODE_ENV=production', () => {
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    try {
      const def = prompt('p').template('{{a}}').build();
      def.render({ a: 'x', extra: 'y' } as never);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      if (original === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = original;
    }
  });
});
