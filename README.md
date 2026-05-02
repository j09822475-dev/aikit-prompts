# @aikit/prompts

[![npm version](https://img.shields.io/npm/v/@aikit/prompts.svg)](https://www.npmjs.com/package/@aikit/prompts)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@aikit/prompts?label=min%2Bgz)](https://bundlephobia.com/package/@aikit/prompts)
[![license](https://img.shields.io/npm/l/@aikit/prompts.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/@aikit/prompts.svg)](https://www.typescriptlang.org/)

Lightweight, zero-dep, type-safe LLM prompt management for TypeScript. Stop scattering inline strings across your codebase: version, template, A/B-test, and cost-track your prompts as code, with the compiler enforcing variable shapes against the template body.

> **Why this exists.** Vercel AI SDK solves streaming and providers but not prompts. LangChain's `PromptTemplate` drags megabytes of transitive dependencies for what should be a 9 KB job. SaaS registries (PromptLayer, Helicone, the now-shuttered Humanloop) charge per seat and put your prompts behind a network round-trip. `@aikit/prompts` fills the gap: prompts live in your repo, ship through git, and run in any JS runtime.

## Features

- **Type-safe variables** — `prompt.render({ ... })` is type-checked against the template body via TypeScript template-literal types. No code generation, no schema files.
- **SemVer versioning** — multiple versions of the same prompt id coexist in a registry; `^1.0.0` ranges, exact pins, and `latest` resolution all work.
- **Deterministic A/B testing** — FNV-1a hashing of a user identifier produces a stable variant assignment with zero network calls. Edge-runtime safe.
- **Per-version cost estimation** — heuristic 4-chars-per-token by default, opt-in `tiktoken` for billing-grade accuracy. Built-in pricing table for OpenAI, Anthropic, and Gemini models (April 2026 snapshot).
- **Prompt-caching aware** — `cacheBreakpoint()` translates to Anthropic `cache_control: { type: 'ephemeral' }`, OpenAI `prompt_cache_key`, and AI SDK `providerOptions`.
- **Composition** — assemble system + few-shot + user blocks; `compose()` aggregates required vars across every block.
- **Tools & structured output** — first-class `tool()` builder with JSON Schema parameters; `responseSchema` flows through every adapter.
- **Hot-reload** — pull prompts from a file glob (Node), HTTPS endpoint (any runtime), or in-memory fixture; HMAC verification via Web Crypto.
- **Provider-agnostic adapters** — drop-in shapes for OpenAI, Anthropic, Vercel AI SDK, and LangChain. The library never imports a provider SDK at runtime.
- **Zero runtime dependencies** — core ≤ 9 KB min+gz; tree-shakeable subpaths for everything else; runs in Node 18+, Bun, Deno, browsers, Vercel Edge, and Cloudflare Workers.

## Quick Start

```bash
npm install @aikit/prompts
```

```ts
import { prompt } from '@aikit/prompts';
import { toOpenAI } from '@aikit/prompts/adapters/openai';
import OpenAI from 'openai';

const greet = prompt('greet.user')
  .version('1.0.0')
  .template('Hello {{name}}, you have {{count:number}} new messages.')
  .build();

const params = toOpenAI(greet, { name: 'Alice', count: 3 });
await new OpenAI().chat.completions.create({ model: 'gpt-4o', ...params });
```

## API Reference

### Core — `@aikit/prompts`

#### `prompt(id): PromptBuilder`

Define a versioned, typed prompt template. Variable names declared in the template (with `{{name}}` syntax) are extracted at compile time, so `render()` is fully type-checked against the template body.

```ts
import { prompt } from '@aikit/prompts';

const greet = prompt('greet.user')
  .version('1.0.0')
  .template('Hello {{name}}, you have {{count:number}} new messages.')
  .build();

greet.render({ name: 'Alice', count: 3 });
// 'Hello Alice, you have 3 new messages.'

greet.render({ name: 'Alice' });
//   ~~~~~~~~~~~~~~~~~~~~~~~~~~ Type error: missing 'count'
```

**Builder methods**:

| Method | Description |
|---|---|
| `.version(semver)` | Attach a `MAJOR.MINOR.PATCH[-pre]` version. |
| `.template(body)` | Set the template body. Drives type inference for required vars. |
| `.input<T>()` | **Non-destructive** — intersect the inferred shape with `T`. Use to narrow one or two keys. |
| `.replaceInput<T>()` | **Destructive** — replace the inferred shape entirely. Use only when the inferred shape is fundamentally wrong. |
| `.partial(values)` | Pre-fill a subset of the variables; `.render()` omits them from the required-keys check. |
| `.metadata(meta)` | Attach JSON-serializable metadata. |
| `.tags(...tags)` | Attach searchable string tags. |
| `.validate(fn)` | Pure function from `vars` → `readonly string[]` of error messages. Non-empty array throws `VariableError`. |
| `.build()` | Finalize into an immutable `PromptDefinition`. Builder is frozen after this call. |

#### `block(role): BlockBuilder`

Define a single message block (a turn in the conversation). Roles: `'system' | 'user' | 'assistant' | 'tool'`.

```ts
import { block } from '@aikit/prompts';

const system = block('system')
  .template('You are {{persona}}.')
  .cacheBreakpoint()
  .build();

const examples = block('user')
  .examples([
    { user: 'Hi', assistant: 'Hello!' },
    { user: 'Bye', assistant: 'Goodbye!' },
  ])
  .build();
```

`cacheBreakpoint()` marks a cache boundary; adapters translate it to `cache_control: { type: 'ephemeral' }` (Anthropic), `prompt_cache_key` (OpenAI), or `providerOptions` (AI SDK). Up to 4 breakpoints per composition (Anthropic limit) — excess collapse to the last 4 with a one-time warning.

#### `tool(def): Tool`

Define a tool / function the LLM can call. Distinct from `block('tool')`, which represents a tool *result* turn.

```ts
import { tool } from '@aikit/prompts';

const search = tool({
  name: 'web_search',
  description: 'Search the web and return the top results.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      maxResults: { type: 'integer', default: 5 },
    },
    required: ['query'],
  },
});
```

`parameters` is a plain JSON Schema object. Bring your own validation — Zod (`zodToJsonSchema`), Valibot, Effect Schema, or hand-written JSON Schema all work.

#### `compose(blocks, options?): Composition`

Compose blocks into a chat-style template. The returned `Composition` aggregates all variables across blocks, so `.render()` requires the union of every block's inputs.

```ts
import { compose } from '@aikit/prompts';

const chat = compose([system, examples, userTurn], {
  tools: [search],
  responseSchema: {
    type: 'object',
    properties: { answer: { type: 'string' }, confidence: { type: 'number' } },
    required: ['answer', 'confidence'],
  },
  cache: 'auto',
});

const messages = chat.render({ persona: 'concise senior engineer', question: 'Why TS?' });
// readonly ChatMessage[]

const text = chat.renderText({ persona: 'concise senior engineer', question: 'Why TS?' });
// single concatenated string
```

#### `compileTemplate(source)` / `extract(source)`

Static analysis helpers. `compileTemplate` returns the parsed AST; `extract` returns the variable names referenced by the template source.

#### `Result<T, E>` and `ok` / `err` / `isOk` / `isErr`

Discriminated union for predictable failures. `PromptDefinition.tryRender()` and `Composition.tryRender()` return `Result<string, VariableError>` instead of throwing.

```ts
import { isErr } from '@aikit/prompts';

const r = greet.tryRender({});
if (isErr(r)) console.error(r.error.code, r.error.missing);
```

#### `PromptError` and `ErrorCode`

Abstract root of the library's error hierarchy. Every thrown error in `@aikit/prompts` extends `PromptError` with a `code: ErrorCode` literal union — switch exhaustively on `error.code`.

```ts
import { PromptError } from '@aikit/prompts';

try {
  greet.render({} as never);
} catch (e) {
  if (e instanceof PromptError && e.code === 'VARIABLE_MISSING') {
    // ...
  }
}
```

### Versioning — `@aikit/prompts/versioning`

#### `createTypedRegistry(map, options?)`

Create a typed registry from a static `{ id → PromptDefinition[] }` map. Lookups carry the precise `PromptDefinition<TVars>` for the registered id, and unknown ids are caught at compile time.

```ts
import { createTypedRegistry } from '@aikit/prompts/versioning';
import { greetV1, greetV2, greetV3Beta, searchV1 } from './prompts';

const registry = createTypedRegistry({
  'greet.user':  [greetV1, greetV2, greetV3Beta],
  'search.user': [searchV1],
});

const latest = registry.get('greet.user');           // typed: TVars from greetV1/V2/V3
const v1     = registry.get('greet.user', '1.0.0');  // exact
const range  = registry.get('greet.user', '^1.0.0'); // any 1.x
const wrong  = registry.get('nope');                 // ❌ type error
```

#### `createRegistry(options?)`

Loose-typed dynamic registry — `get()` returns `PromptDefinition<Record<string, unknown>>`. Use this for hot-reloaded prompts whose shape isn't statically known.

```ts
const registry = createRegistry({ prompts: [greetV1] });
registry.addSource(httpSource({ url: '...' }));
registry.on('change', (e) => log(e));
await registry.dispose();
```

**Selector forms**: `undefined` → highest stable; `'1.2.3'` → exact; `^1.2.3`, `~1.2.3`, `>=1.2.3`, `1.x`, `*` → SemVer range. Compound `||`/`&&` ranges are intentionally out of scope.

#### Helpers

`parseVersion`, `isValidVersion`, `compareVersions`, `satisfiesRange`, plus the `SemVer` interface.

### A/B Testing — `@aikit/prompts/testing`

#### `createABTest(options): ABTest`

Deterministic A/B (or A/B/C/...) split test over multiple prompt variants. **All variants must share the same `TVars`** — enforced at the type level.

```ts
import { createABTest, stickyUserOrSession } from '@aikit/prompts/testing';

const test = createABTest({
  name: 'search-prompt-2026-q2',
  variants: [
    { id: 'control',   prompt: searchV1, weight: 50 },
    { id: 'rephrased', prompt: searchV2, weight: 50 },
  ],
  identifier: stickyUserOrSession, // ctx => ctx.userId ?? ctx.sessionId
  holdout: 0.1,                    // 10% of traffic excluded
});

const a = test.assign({ userId: 'user-42' });
switch (a.kind) {
  case 'variant':
    a.prompt.render({ query: 'TypeScript generics' });
    break;
  case 'holdout':
    /* fall back to control */ break;
  case 'unassigned':
    /* identifier missing or threw */ break;
}
```

Assignment is computed client-side via FNV-1a hashing — same identifier always lands on the same variant, no network round-trip.

#### Helpers

- `stickyUserOrSession` — `(ctx) => ctx.userId ?? ctx.sessionId`.
- `identifierFromKey(key)` — pulls a string from `ctx[key]`.
- `fnv1a32(input)` / `bucketize(value)` — exposed for advanced custom bucketing.

### Cost — `@aikit/prompts/cost`

#### `estimateCost(args): CostEstimate`

Estimate input/output token counts and dollar cost for a `(prompt, vars, model)` tuple. Generic in `TVars` so `vars` is type-checked against the prompt's input shape.

```ts
import { estimateCost, registerModel } from '@aikit/prompts/cost';

const rough = estimateCost({
  prompt: greet,
  vars: { name: 'Alice', count: 3 },
  model: 'gpt-4o',
  expectedOutputTokens: 200,
});
// { inputTokens, outputTokens, inputCostUSD, outputCostUSD, totalUSD,
//   currency: 'USD', model, pricingDate, tokenizer: 'heuristic-4cpt', accuracy: 'rough' }
```

> **Honesty about the heuristic.** The default tokenizer is `Math.ceil(text.length / 4)` — fine for ballparking ("which prompt version is roughly cheaper") and wrong for billing-grade accounting. Use `tiktokenFor(model)` for production-accurate counts.

#### `roughCost`

Alias of `estimateCost` — re-exported under a name that signals "rough" at the call site.

#### `estimateTokens(args): TokenEstimate`

Tokens-only counterpart. Same generic, no pricing/model required.

#### `registerModel(model, pricing)` / `unregisterModel(model)` / `listModels()` / `getPricing(model)`

Add or override pricing for a custom or private model.

```ts
registerModel('internal-llama-70b', {
  inputUSDPer1M: 0.5,
  outputUSDPer1M: 1.5,
});
```

Built-in pricing covers `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1`, `o1-mini`, `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest`, `claude-3-opus-latest`, `gemini-1.5-pro`, `gemini-1.5-flash`. `BUILTIN_PRICING` and `PRICING_DATE` are exported for callers who want to inspect or freeze the snapshot.

### Cost (tiktoken) — `@aikit/prompts/cost/tiktoken`

#### `tiktokenFor(model): TokenizerFn`

Build a `TokenizerFn` backed by `js-tiktoken` for the given model. `js-tiktoken` is a peer-optional dependency — installed only when this subpath is imported.

```ts
import { estimateCost } from '@aikit/prompts/cost';
import { tiktokenFor } from '@aikit/prompts/cost/tiktoken';

const accurate = estimateCost({
  prompt: greet,
  vars: { name: 'Alice', count: 3 },
  model: 'gpt-4o',
  expectedOutputTokens: 200,
  tokenizer: tiktokenFor('gpt-4o'),
});
// accurate.tokenizer === 'tiktoken/o200k_base', accurate.accuracy === 'exact'
```

Unknown models fall back to `cl100k_base` with a one-time `console.warn` and a tagged id (`'tiktoken/cl100k_base (fallback)'`).

### Sources — `@aikit/prompts/sources`, `/sources/fs`, `/sources/http`

Universal subpath exports `memorySource` (synchronous fixture) and `verifyHmac` (Web Crypto-based HMAC verifier). Edge-safe.

```ts
import { memorySource, verifyHmac } from '@aikit/prompts/sources';
import { httpSource } from '@aikit/prompts/sources/http';
import { fsSource } from '@aikit/prompts/sources/fs';
import { createRegistry } from '@aikit/prompts/versioning';

const registry = createRegistry();

registry.addSource(
  httpSource({
    url: 'https://kv.example.com/prompts.json',
    ttlMs: 60_000,
    pollMs: 30_000,
    headers: { authorization: `Bearer ${env.PROMPT_TOKEN}` },
    verify: verifyHmac({
      secret: env.PROMPT_SIGNING_SECRET,
      headerName: 'x-prompt-signature',
      algorithm: 'SHA-256',
    }),
  }),
);

// Node-only:
registry.addSource(
  fsSource({ glob: './prompts/**/*.json', watch: true }),
);

await registry.dispose(); // drains pending watchers, closes sockets
```

| Source | Runtime | Notes |
|---|---|---|
| `memorySource(records, name?)` | universal | Static fixture; emits no change events. |
| `httpSource(options)` | universal | `fetch`-based; optional `ttlMs` cache, `pollMs` polling with jittered exponential backoff, `verify` integrity hook. |
| `fsSource(options)` | Node 18+ | Lazy-imports `node:fs/promises`; supports `**/*.json` glob and `node:fs.watch` with debounce. |
| `verifyHmac(options)` | universal | Web Crypto HMAC verifier; supports SHA-256/384/512 and hex/base64/base64url encoding. |

> **Trust boundary.** Hot-reloading prompts from a URL is effectively remote code execution into the LLM context. TLS protects the wire, but the KV/CDN provider itself is in the threat model. Always wire up `verify` for HTTP sources.

### Adapters — `@aikit/prompts/adapters/{openai,anthropic,ai-sdk,langchain}`

All adapters are generic in the prompt's input shape `TVars`. The `vars` argument is type-checked against the prompt definition — no `Record<string, unknown>` widening at the adapter boundary.

```ts
import { toOpenAI } from '@aikit/prompts/adapters/openai';
import { toAnthropic } from '@aikit/prompts/adapters/anthropic';
import { toAISDK } from '@aikit/prompts/adapters/ai-sdk';
import { toLangChain } from '@aikit/prompts/adapters/langchain';
```

| Adapter | Returns | Notes |
|---|---|---|
| `toOpenAI(src, vars)` | `{ messages, tools?, response_format?, prompt_cache_key? }` | Fits `chat.completions.create`. Multimodal text + image parts. |
| `toAnthropic(src, vars)` | `{ system?, messages, tools? }` | Fits `messages.create`. Cache breakpoints → `cache_control: { type: 'ephemeral' }`. Multiple `system` blocks concatenate with a one-time warning. |
| `toAISDK(src, vars)` | `{ messages, tools?, experimental_output?, providerOptions? }` | Fits `streamText`/`generateText`. Cache hints flow through `providerOptions`. |
| `toLangChain(src, vars)` | `readonly LangChainMessage[]` | Structural compat layer; no `@langchain/core` import at runtime. |

Adapters never import provider SDKs at runtime — they shape data. Type-checking against the SDK requires the (optional) peer dep.

### Template Extras — `@aikit/prompts/template-extras`

Iteration directives and partial inclusion live in an opt-in subpath so the substitution-only core stays small.

```ts
import { withIfEach, withPartials, registerPartial } from '@aikit/prompts/template-extras';

withIfEach();    // enables {{#if x}}…{{/if}} and {{#each items}}…{{/each}}
withPartials();  // enables {{> name}}

registerPartial('signature', '— signed, the team');
```

Importing the subpath does not auto-activate — call the activator(s) once at startup. The split keeps `sideEffects: false` and tree-shaking guarantees intact.

## Framework Guides

### Next.js (App Router, Edge Runtime)

```ts
// app/api/answer/route.ts
import { prompt } from '@aikit/prompts';
import { toOpenAI } from '@aikit/prompts/adapters/openai';
import OpenAI from 'openai';

export const runtime = 'edge';

const answer = prompt('answer.qa')
  .version('1.0.0')
  .template('You are {{persona}}. Answer concisely: {{question}}')
  .build();

export async function POST(req: Request) {
  const { question } = await req.json();
  const params = toOpenAI(answer, { persona: 'a senior engineer', question });
  const completion = await new OpenAI().chat.completions.create({
    model: 'gpt-4o',
    ...params,
  });
  return Response.json(completion.choices[0]?.message);
}
```

The core and HTTP source are edge-safe. `fsSource` is Node-only — do not import it from an edge route.

### Express

```ts
import express from 'express';
import { prompt } from '@aikit/prompts';
import { createRegistry } from '@aikit/prompts/versioning';
import { fsSource } from '@aikit/prompts/sources/fs';
import { toAnthropic } from '@aikit/prompts/adapters/anthropic';
import Anthropic from '@anthropic-ai/sdk';

const registry = createRegistry();
registry.addSource(fsSource({ glob: './prompts/**/*.json', watch: true }));

const app = express();
app.post('/answer', express.json(), async (req, res) => {
  const def = registry.get('answer.qa', '^1.0.0');
  const params = toAnthropic(def, req.body);
  const result = await new Anthropic().messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 1024,
    ...params,
  });
  res.json(result);
});
```

### Hono (Cloudflare Workers / Bun)

```ts
import { Hono } from 'hono';
import { prompt } from '@aikit/prompts';
import { toAISDK } from '@aikit/prompts/adapters/ai-sdk';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const summarize = prompt('summarize.long')
  .version('1.0.0')
  .template('Summarize the following in {{maxWords:number}} words:\n\n{{text}}')
  .build();

const app = new Hono();
app.post('/summarize', async (c) => {
  const body = await c.req.json();
  const args = toAISDK(summarize, { text: body.text, maxWords: 50 });
  const { text } = await generateText({ model: openai('gpt-4o-mini'), ...args });
  return c.json({ text });
});

export default app;
```

## Configuration

### Render options

```ts
greet.render({ name: 'Alice', count: 3 }, { escape: 'markdown', strict: true });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `escape` | `'none' \| 'markdown' \| 'json'` | `'none'` | Escape values: `markdown` escapes `*_~|>#`; `json` JSON-stringifies. |
| `strict` | `boolean` | `true` | Warn on unknown keys in the input record (dev-only). Missing required vars **always** throw. |

### Compose options

| Option | Type | Description |
|---|---|---|
| `id` | `string` | Optional id for the composition. |
| `version` | `string` | Optional SemVer. |
| `tools` | `readonly Tool[]` | Tool / function definitions for adapters. |
| `responseSchema` | `JSONSchema` | Structured-output schema. |
| `cache` | `'auto' \| 'off'` | Whether `cacheBreakpoint()` marks emit provider hints. Default `'auto'`. |

### Registry options

| Option | Type | Default | Description |
|---|---|---|---|
| `prompts` | `readonly PromptDefinition[]` | `[]` | Initially registered prompts. |
| `excludePrereleaseFromLatest` | `boolean` | `true` | Reject pre-release versions from `'latest'` resolution. |

### A/B test options

| Option | Type | Description |
|---|---|---|
| `name` | `string` | Stable name; mixed into the hash so two tests segment independently. |
| `variants` | `readonly VariantDefinition[]` | Weights must sum to `(0, 100]`. |
| `identifier` | `(ctx) => string \| undefined` | Pure function returning the bucketing identifier. |
| `holdout` | `number` | Fraction `[0, 1]` excluded from the test entirely. |
| `hash` | `(input: string) => number` | Override for the hash function (default: FNV-1a 32). |

### HTTP source options

| Option | Type | Description |
|---|---|---|
| `url` | `string` | Endpoint returning a JSON array of `PromptDefinitionJson`. |
| `fetch` | `typeof fetch` | Custom fetch (e.g. for tests/proxies). |
| `headers` | `HeadersInit` | Headers attached to every request. |
| `ttlMs` | `number` | Cache the last successful response for N ms. |
| `pollMs` | `number` | Polling interval. Each tick adds 0–10% jitter; failures double the delay (capped at `pollMs * 2^30`). |
| `parser` | `(raw) => readonly PromptDefinitionJson[]` | Custom parser if the endpoint returns a non-array shape. |
| `verify` | `VerifyFn` | Integrity check (`(body, response) => boolean \| Promise<boolean>`). |
| `name` | `string` | Optional explicit source name. |

### File-system source options

| Option | Type | Description |
|---|---|---|
| `glob` | `string` | Directory pattern with trailing `**/*.json` or explicit single file. |
| `watch` | `boolean` | Watch matching files and emit change events. |
| `parser` | `(raw, path) => PromptDefinitionJson` | Custom parser. |
| `name` | `string` | Optional explicit source name. |
| `debounceMs` | `number` | Watcher debounce in ms (default 50). |

## TypeScript Features

- **Template-literal-typed variables.** `prompt('p').template('Hi {{name}}, age {{age:number}}')` infers `{ name: string; age: number }`. Supported tokens: bare (`{{name}}`), optional (`{{name?}}`), typed (`{{name:string}}`, `:number`, `:boolean`, `:string[]`, `:number[]`, `:boolean[]`), and combinations (`{{name?:number}}`).
- **Composition variable union.** `compose([a, b, c])` requires the union of every block's vars; missing a var buried in block `c` is a compile error at `chat.render(...)`.
- **Partial application typing.** `.partial({ a: 1 })` removes `a` from the render-required set. Chained partials accumulate.
- **Typed registry.** `createTypedRegistry({ id: [defs] })` returns `TypedPromptRegistry<TMap>` — `registry.get(id)` carries the precise `PromptDefinition<TVars>`, and unknown ids fail to compile.
- **A/B variant union.** `createABTest({ variants: [...] }).assign(ctx)` returns an `Assignment<TVariantId, TVars>` discriminated on `kind` — switch exhaustively without widening to `string`.
- **Result helper.** `tryRender()` returns `Result<string, VariableError>` for boundary code that already speaks in result types.
- **Strict tsconfig.** The library is written under `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `noPropertyAccessFromIndexSignature`.

```ts
// Editor hovers show the resolved input shape, not the raw intersection chain.
type Input = InputShape<'Hi {{name}}, age {{age:number}}, items {{items:string[]}}'>;
// = { name: string; age: number; items: string[] }
```

## Comparison

| | `@aikit/prompts` | `@langchain/core` `PromptTemplate` | `promptfoo` | `promptbook` | PromptLayer | Helicone | Humanloop |
|---|---|---|---|---|---|---|---|
| Bundle (min+gz, core) | **≤ 9 KB** | ~megabytes (transitive) | CLI-first, not a runtime lib | small | SDK + SaaS | SDK + SaaS | (shut down 2025-09) |
| Runtime deps | **0** | many | many | few | network | network | network |
| Type-safe variables | **template-literal types, no codegen** | via Zod (extra step) | n/a (runtime DSL) | DSL-based | runtime fetch, no static types | runtime fetch, no static types | runtime fetch |
| Versioning | **SemVer registry, local-first** | n/a | n/a | n/a | SaaS | SaaS | SaaS |
| A/B testing | **deterministic, client-side, edge-safe** | n/a | offline eval | n/a | SaaS | SaaS | SaaS |
| Cost estimation | **per-version, heuristic + tiktoken** | n/a | yes (eval) | n/a | dashboard | dashboard | dashboard |
| Prompt-caching aware | **Anthropic + OpenAI + AI SDK** | partial | n/a | n/a | n/a | n/a | n/a |
| Provider-agnostic | **OpenAI, Anthropic, AI SDK, LangChain adapters** | LangChain-bound | yes | yes | yes | yes | yes |
| Edge runtime | **Node 18+, Bun, Deno, browsers, Vercel Edge, Cloudflare Workers** | partial | no | partial | yes | yes | yes |
| License | **MIT** | MIT | MIT | Apache-2.0 | proprietary | proprietary | proprietary (defunct) |
| Hosting | **local-first (git)** | local | local | local | SaaS only | SaaS only | SaaS only |

The headline trade: `@aikit/prompts` keeps prompts in your repo and runs anywhere; SaaS registries trade that for a UI and team workflows. Pick LangChain when you already live inside its runnable abstraction; pick `@aikit/prompts` when you want a focused tool that does one thing and tree-shakes.

## Contributing

Issues and PRs welcome. Before opening a PR:

1. `npm install`
2. `npm run lint && npm run typecheck && npm run test && npm run build`
3. `npm run size` to confirm the bundle stays under budget (core ≤ 9 KB min+gz)

Type-level changes need an accompanying `*.test-d.ts` under `tests/types/`. Public API changes need a CHANGELOG entry.

## License

[MIT](./LICENSE) © Mykhailo Kryvytskyi
