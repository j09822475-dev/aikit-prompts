/**
 * @aikit/prompts — advanced usage.
 *
 * Walks through a realistic production scenario for a code-review
 * assistant feature:
 *
 *   1. Compose a chat-style prompt: system + few-shot + user blocks.
 *   2. Define a tool the model may call (web_search) and a JSON-Schema
 *      response shape for structured output.
 *   3. Mark a cache breakpoint between the static system prompt and the
 *      dynamic user turn so the system block is reused across requests.
 *   4. Register two prompt versions in a typed registry and resolve by
 *      SemVer range.
 *   5. Run a deterministic A/B split between v1 and v2 keyed on userId.
 *   6. Estimate per-version cost with the heuristic tokenizer first,
 *      then with `tiktoken` for billing-grade accuracy.
 *   7. Emit the OpenAI- and Anthropic-shaped request payloads.
 *
 * Everything below is pure data shaping — no network calls, no SDK
 * instances. Run: npx tsx examples/advanced-usage.ts
 */

import { block, compose, prompt, tool } from '@aikit/prompts';
import { toAnthropic } from '@aikit/prompts/adapters/anthropic';
import { toOpenAI } from '@aikit/prompts/adapters/openai';
import { estimateCost } from '@aikit/prompts/cost';
import { createABTest, stickyUserOrSession } from '@aikit/prompts/testing';
import { createTypedRegistry } from '@aikit/prompts/versioning';

// ── 1. Blocks ──────────────────────────────────────────────────────────────

const systemBlock = block('system')
  .template(
    'You are {{persona}}. Review the diff and answer with strict JSON.',
  )
  .partial({ persona: 'a senior staff engineer focused on correctness' })
  .cacheBreakpoint()
  .build();

const examplesBlock = block('user')
  .examples([
    {
      user: 'Review:\n```ts\nconst x = a == b;\n```',
      assistant:
        '{"verdict":"changes_requested","issues":["use === for strict equality"]}',
    },
    {
      user: 'Review:\n```ts\nfor (let i = 0; i < arr.length; i++) {}\n```',
      assistant:
        '{"verdict":"approve","issues":[]}',
    },
  ])
  .build();

const userBlock = block('user')
  .template(
    'Review this {{language}} diff and respond JSON only:\n\n```{{language}}\n{{diff}}\n```',
  )
  .build();

// ── 2. Tools and structured output ─────────────────────────────────────────

const webSearch = tool({
  name: 'web_search',
  description: 'Search the web for relevant docs / RFCs / issues.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      maxResults: { type: 'integer', default: 5 },
    },
    required: ['query'],
    additionalProperties: false,
  },
});

const responseSchema = {
  type: 'object',
  properties: {
    verdict: { enum: ['approve', 'changes_requested', 'comment'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'issues'],
  additionalProperties: false,
} as const;

// ── 3. Two versions of the composed prompt ─────────────────────────────────

const reviewV1 = compose([systemBlock, examplesBlock, userBlock], {
  id: 'pr.review',
  version: '1.0.0',
  tools: [webSearch],
  responseSchema,
  cache: 'auto',
});

// v2 swaps the system persona for a more conservative reviewer.
const systemV2 = block('system')
  .template(
    'You are {{persona}}. Review the diff and answer with strict JSON.',
  )
  .partial({
    persona: 'a security-focused tech lead — flag anything that affects auth, secrets, or PII',
  })
  .cacheBreakpoint()
  .build();

const reviewV2 = compose([systemV2, examplesBlock, userBlock], {
  id: 'pr.review',
  version: '2.0.0',
  tools: [webSearch],
  responseSchema,
  cache: 'auto',
});

// PromptDefinition wrappers so the registry / A-B test can carry typed vars.
const reviewV1Def = prompt('pr.review')
  .version('1.0.0')
  .template(
    'Review this {{language}} diff and respond JSON only:\n\n```{{language}}\n{{diff}}\n```',
  )
  .build();

const reviewV2Def = prompt('pr.review')
  .version('2.0.0')
  .template(
    'Security-first review of this {{language}} diff. Respond JSON only:\n\n```{{language}}\n{{diff}}\n```',
  )
  .build();

// ── 4. Typed registry with SemVer resolution ───────────────────────────────

const registry = createTypedRegistry({
  'pr.review': [reviewV1Def, reviewV2Def],
});

console.log('--- registry ---');
console.log('all versions :', registry.list('pr.review').map((p) => p.version));
console.log('latest stable:', registry.get('pr.review').version);
console.log('exact ^1.0.0 :', registry.get('pr.review', '^1.0.0').version);
console.log('exact ~2.0.0 :', registry.get('pr.review', '~2.0.0').version);

// ── 5. Deterministic A/B split ─────────────────────────────────────────────

const abTest = createABTest({
  name: 'pr-review-2026-q2',
  variants: [
    { id: 'control', prompt: reviewV1Def, weight: 70 },
    { id: 'security-first', prompt: reviewV2Def, weight: 30 },
  ],
  identifier: stickyUserOrSession,
  holdout: 0.05,
});

console.log('\n--- A/B assignments ---');
const buckets = { control: 0, 'security-first': 0, holdout: 0, unassigned: 0 };
for (let i = 0; i < 10_000; i++) {
  const a = abTest.assign({ userId: `user-${i}` });
  buckets[a.kind === 'variant' ? a.id : a.kind]++;
}
console.log(buckets);

// Same userId is always sticky.
const a1 = abTest.assign({ userId: 'user-42' });
const a2 = abTest.assign({ userId: 'user-42' });
console.log('sticky:', a1.kind === 'variant' && a2.kind === 'variant'
  ? `user-42 → ${a1.id} (twice: ${a1.id === a2.id})`
  : 'unassigned');

// ── 6. Cost estimation per prompt version ─────────────────────────────────

const sampleVars = {
  language: 'typescript',
  diff: '+ const password = req.body.password;\n+ db.query(`SELECT * FROM users WHERE pw = ${password}`);\n',
};

// Default heuristic: Math.ceil(text.length / 4). Fine for ballpark-ranking
// prompt versions. For billing-grade accuracy, swap in `tiktokenFor` from
// `@aikit/prompts/cost/tiktoken` (peer-optional, lazy-loads `js-tiktoken`).
const v1Cost = estimateCost({
  prompt: reviewV1Def,
  vars: sampleVars,
  model: 'gpt-4o',
  expectedOutputTokens: 200,
});

const v2Cost = estimateCost({
  prompt: reviewV2Def,
  vars: sampleVars,
  model: 'gpt-4o',
  expectedOutputTokens: 200,
});

console.log('\n--- per-version cost estimate (gpt-4o, 200 expected output) ---');
const fmt = (n: number) => `$${n.toFixed(6)}`;
console.log('v1.0.0:', v1Cost.inputTokens, 'in /', v1Cost.outputTokens, 'out =',
  fmt(v1Cost.totalUSD), '(', v1Cost.tokenizer, ')');
console.log('v2.0.0:', v2Cost.inputTokens, 'in /', v2Cost.outputTokens, 'out =',
  fmt(v2Cost.totalUSD), '(', v2Cost.tokenizer, ')');
console.log('Δ     :', fmt(v2Cost.totalUSD - v1Cost.totalUSD), 'per call');

// ── 7. Adapter output for OpenAI and Anthropic ─────────────────────────────

const openAIPayload = toOpenAI(reviewV1, sampleVars);
const anthropicPayload = toAnthropic(reviewV1, sampleVars);

console.log('\n--- toOpenAI(...) ---');
console.log('messages   :', openAIPayload.messages.length, 'turns');
console.log('tools      :', openAIPayload.tools?.length, 'function(s)');
console.log('cache key  :', openAIPayload.prompt_cache_key ?? '(none)');

console.log('\n--- toAnthropic(...) ---');
const cachedSystemBlocks = (anthropicPayload.system ?? []).filter(
  (b) => 'cache_control' in b,
);
console.log('system blks:', anthropicPayload.system?.length);
console.log('cached blks:', cachedSystemBlocks.length, '(ephemeral)');
console.log('messages   :', anthropicPayload.messages.length, 'turns');
console.log('tools      :', anthropicPayload.tools?.length);
