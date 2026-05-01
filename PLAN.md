# @aikit/prompts — Architecture Plan

> Lightweight, zero-dep, type-safe LLM prompt management for TypeScript.
> Templates with template-literal-typed variables, semver versioning, deterministic A/B split testing, per-version cost tracking, hot-reload sources, provider-agnostic output.

---

## 0. Design Principles

1. **Zero runtime dependencies.** The core ships with no `dependencies` and runs in Node 18+, Bun, Deno, browsers, Vercel Edge Runtime, and Cloudflare Workers. Provider SDKs are `peerDependencies` with `optional: true` and only loaded inside subpath adapters.
2. **Type-safety as the headline feature.** Variable names are extracted from the template string literal at compile time. `prompt.render({ ... })` cannot type-check unless the caller passes the exact required keys. No code-generation step.
3. **Composition, not inheritance.** No deep class hierarchies; the library is built around a small set of plain data structures (`PromptDefinition`, `Block`, `Composition`, `Variant`) and free functions that operate on them. Builders are syntactic sugar over these structures.
4. **Local-first.** Prompts live in the repo as `.ts` / `.json` / `.md` files and are version-controlled with git. Remote sources (HTTP, KV stores) are optional layers, not the default.
5. **Tree-shakeable subpaths.** `versioning`, `testing`, `cost`, `sources/*`, `adapters/*` are independent entry points. A user importing only `prompt()` should not pull A/B testing or cost tables into their bundle.
6. **Provider-agnostic core.** The core never imports OpenAI / Anthropic / Vercel AI SDK types. Adapters live in dedicated subpaths.
7. **Deterministic by default.** A/B assignment, render output, and cost estimation produce the same result for the same inputs. No clocks, no `Math.random()` in the core.
8. **Errors are typed and discriminable.** All thrown errors extend `PromptError` with a `code` literal union. Boundary functions that can predictably fail return a `Result<T, E>` instead of throwing.
9. **Edge-runtime first.** No `node:fs`, `node:crypto`, or `Buffer` in the core or in the universal `sources` barrel and `sources/http` module. Node-only sources (`sources/fs`) are isolated in their own subpath. Web Crypto (`SubtleCrypto`) is the only crypto primitive used (by `verifyHmac`), and it's universal across Node 18+, Bun, Deno, browsers, Vercel Edge, and Cloudflare Workers.
10. **Bundle discipline.** Hard size budget enforced via `size-limit` in CI, measured **minified + gzip** to match ecosystem norms (size-limit's `preset-small-lib` default). Core ≤ 9 KB min+gz hard cap, 7 KB target. Iteration directives (`{{#if}}`, `{{#each}}`, `{{> partial}}`) live in the opt-in `template-extras` subpath so the 80% substitution-only case stays small.

---

## 1. Project Structure

```
aikit-prompts/
├── PLAN.md                            # this document
├── README.md                          # written after implementation
├── LICENSE                            # MIT
├── package.json                       # exports map, scripts, peerDeps
├── tsconfig.json                      # strict TS, ESNext, bundler module resolution
├── tsconfig.build.json                # extends tsconfig, "noEmit": false, excludes tests
├── tsup.config.ts                     # multi-entry ESM build with .d.ts
├── vitest.config.ts                   # node + edge-runtime pools, typecheck enabled
├── .gitignore
├── .npmignore                         # excludes tests/, examples/, *.test-d.ts
├── .eslintrc.cjs                      # @typescript-eslint, no-unused-vars, etc.
├── .prettierrc                        # 2-space, single-quote, trailing commas
│
├── src/
│   ├── index.ts                       # public root barrel — re-exports the core API
│   │
│   ├── core/
│   │   ├── prompt.ts                  # `prompt()` builder + `PromptDefinition`
│   │   ├── block.ts                   # `block()` builder, `cacheBreakpoint()` chain step
│   │   ├── tool.ts                    # `tool()` builder — typed tool/function definitions
│   │   ├── compose.ts                 # `compose()` — combines blocks into a Composition
│   │   ├── template.ts                # template parser (AST), render(), variable extraction
│   │   ├── render-context.ts          # runtime helpers shared by prompts and blocks
│   │   └── types.ts                   # PromptDefinition, Block, Composition, Tool, Role, Message, CacheBreakpoint
│   │
│   ├── template-extras/               # opt-in subpath: iteration directives, partials
│   │   ├── index.ts                   # public barrel — `withIfEach()`, `withPartials()` parser extensions
│   │   ├── if.ts                      # `{{#if var}}…{{/if}}` directive
│   │   ├── each.ts                    # `{{#each items}}…{{/each}}` directive
│   │   └── partial.ts                 # `{{> name}}` partial inclusion
│   │
│   ├── types/
│   │   ├── extract-vars.ts            # `ExtractVariables<T>` template-literal-types magic
│   │   ├── input-shape.ts             # `InputShape<T, Override>` derives final input type
│   │   ├── partial-vars.ts            # types for partial application / required-rest detection
│   │   ├── role.ts                    # 'system' | 'user' | 'assistant' | 'tool'
│   │   ├── message.ts                 # ChatMessage, MultimodalPart, ToolCall
│   │   └── result.ts                  # `Result<T, E>` discriminated union helper
│   │
│   ├── errors/
│   │   ├── index.ts                   # public barrel
│   │   ├── base.ts                    # `PromptError` abstract class + ErrorCode union
│   │   ├── template-error.ts          # parser/render failures
│   │   ├── variable-error.ts          # missing / invalid variable
│   │   ├── version-error.ts           # semver parse / version not found
│   │   ├── ab-test-error.ts           # invalid weights, duplicate variant ids
│   │   ├── cost-error.ts              # unknown model, missing pricing
│   │   └── source-error.ts            # load/parse from filesystem or HTTP
│   │
│   ├── versioning/
│   │   ├── index.ts                   # public barrel
│   │   ├── registry.ts                # `createRegistry()` + `PromptRegistry`
│   │   ├── semver.ts                  # tiny SemVer parser/comparator/range matcher
│   │   ├── selector.ts                # 'latest' | exact | range selector implementation
│   │   └── types.ts                   # RegistryOptions, PromptRecord, VersionRange
│   │
│   ├── testing/
│   │   ├── index.ts                   # public barrel
│   │   ├── ab-test.ts                 # `createABTest()` + `ABTest` class
│   │   ├── hash.ts                    # FNV-1a 32-bit hash for deterministic assignment
│   │   ├── allocation.ts              # weight-bucket math, normalization
│   │   ├── traffic.ts                 # holdout / sticky-bucketing helpers
│   │   └── types.ts                   # Variant, Assignment, ABTestOptions, IdentifierFn
│   │
│   ├── cost/
│   │   ├── index.ts                   # public barrel
│   │   ├── estimate.ts                # `estimateCost()` / `estimateTokens()` — heuristic by default
│   │   ├── pricing.ts                 # built-in per-model price table (Apr 2026 snapshot)
│   │   ├── pricing-registry.ts        # `registerModel()` for custom prices
│   │   ├── tokenizer.ts               # rough heuristic (~4 chars/token) + `TokenizerFn` adapter type
│   │   ├── tiktoken.ts                # OPTIONAL subpath `@aikit/prompts/cost/tiktoken` — lazy-imports `js-tiktoken` (peer-optional)
│   │   └── types.ts                   # ModelPricing, CostEstimate, TokenizerFn
│   │
│   ├── sources/
│   │   ├── index.ts                   # public barrel — exports `memorySource()` + `verifyHmac` helper (universal, edge-safe)
│   │   ├── memory.ts                  # `memorySource()` — inlined into `sources` barrel (no separate subpath)
│   │   ├── http.ts                    # `httpSource()` — fetch-based, edge-safe, HMAC/Ed25519 verify hook
│   │   ├── fs.ts                      # `fsSource()` — Node-only, behind dynamic import
│   │   ├── verify.ts                  # `verifyHmac({ secret, headerName, algorithm })` — Web Crypto-based
│   │   ├── parse.ts                   # JSON-only serialized PromptDefinition parser
│   │   └── types.ts                   # PromptSource, LoadResult, SourceOptions, VerifyFn
│   │
│   ├── adapters/
│   │   ├── openai/
│   │   │   ├── index.ts               # `toOpenAI<TVars>()` — Composition → ChatCompletion params, tool defs, structured-output schemas
│   │   │   └── types.ts               # local re-typed view of openai shapes (no SDK import at runtime)
│   │   ├── anthropic/
│   │   │   ├── index.ts               # `toAnthropic<TVars>()` → MessageCreateParams; `cache_control: { type: 'ephemeral' }` for cache breakpoints
│   │   │   └── types.ts
│   │   ├── ai-sdk/
│   │   │   ├── index.ts               # `toAISDK<TVars>()` → CoreMessage[] for `streamText`/`generateText`
│   │   │   └── types.ts
│   │   └── langchain/
│   │       ├── index.ts               # `toLangChain<TVars>()` → BaseMessage[] (compat layer)
│   │       └── types.ts
│   │       # `toMCP()` — planned for v0.2 (MCP prompt-template envelope), not v0.1.
│   │
│   └── internal/
│       ├── parser.ts                  # template parser → TemplateAst
│       ├── ast.ts                     # TemplateAst node types (Text | Var | Cond | Loop | Partial)
│       ├── escape.ts                  # variable escape & html/markdown helpers
│       ├── deep-equal.ts              # structural equality (used by registry dedupe)
│       └── invariant.ts               # `invariant()` assertion wrapper
│
├── tests/
│   ├── core/
│   │   ├── prompt.test.ts
│   │   ├── block.test.ts
│   │   ├── compose.test.ts
│   │   └── template.test.ts
│   ├── versioning/
│   │   ├── registry.test.ts
│   │   ├── semver.test.ts
│   │   └── selector.test.ts
│   ├── testing/
│   │   ├── ab-test.test.ts
│   │   ├── hash.test.ts
│   │   └── allocation.test.ts
│   ├── cost/
│   │   ├── estimate.test.ts
│   │   ├── pricing.test.ts
│   │   └── tokenizer.test.ts
│   ├── sources/
│   │   ├── memory.test.ts
│   │   ├── http.test.ts
│   │   └── fs.test.ts                 # node-only, skipped in edge pool
│   ├── adapters/
│   │   ├── openai.test.ts
│   │   ├── anthropic.test.ts
│   │   ├── ai-sdk.test.ts
│   │   └── langchain.test.ts
│   ├── errors/
│   │   └── errors.test.ts
│   ├── types/                         # `vitest --typecheck` files (assert TS types)
│   │   ├── extract-vars.test-d.ts
│   │   ├── input-shape.test-d.ts
│   │   ├── prompt-builder.test-d.ts
│   │   └── compose.test-d.ts
│   ├── e2e/
│   │   ├── ab-with-cost.test.ts
│   │   ├── hot-reload.test.ts
│   │   └── multi-version.test.ts
│   └── helpers/
│       ├── fixtures.ts
│       └── mock-fetch.ts
│
├── examples/
│   ├── 01-basic-template.ts
│   ├── 02-versioning.ts
│   ├── 03-composition.ts
│   ├── 04-ab-testing.ts
│   ├── 05-cost-tracking.ts
│   ├── 06-hot-reload-fs.ts
│   ├── 07-hot-reload-http.ts
│   ├── 08-with-openai.ts
│   ├── 09-with-anthropic.ts
│   ├── 10-with-vercel-ai-sdk.ts
│   └── prompts/                       # sample serialized prompts for hot-reload examples
│       ├── greet.v1.json
│       └── greet.v2.json
│
└── benchmarks/
    ├── render.bench.ts                # template render throughput
    ├── ab-assignment.bench.ts         # hash + bucket throughput
    └── parse.bench.ts                 # parser cost
```

### File-by-file responsibility

| Path | Responsibility |
|---|---|
| `src/index.ts` | Root barrel — re-exports `prompt`, `block`, `tool`, `compose`, core types, `Result` helper. Does NOT re-export versioning/testing/cost/adapters (forces tree-shakeable subpath imports). |
| `src/core/prompt.ts` | `prompt(id)` builder. Returns chainable `PromptBuilder<Vars>` with `.version()`, `.template()`, `.input<T>()` (intersect, non-destructive), `.replaceInput<T>()` (destructive), `.partial()`, `.metadata()`, `.tags()`, `.validate()`, `.build()`. |
| `src/core/block.ts` | `block(role)` builder. Identical surface to `prompt()` but produces a `Block` with a role tag (`system`, `user`, `assistant`, `tool`). Also `block.examples([...])` for few-shot, and `block.cacheBreakpoint()` to mark a cache boundary translated by adapters into `cache_control: { type: 'ephemeral' }` (Anthropic) or the equivalent OpenAI prompt-cache hint. |
| `src/core/tool.ts` | `tool({ name, description, parameters })` builder — first-class tool/function definitions distinct from the `'tool'` role. `parameters` accepts a JSON Schema object (or a `toJSONSchema()`-compatible value, e.g. from Zod/Valibot adapters in user code). Adapters render these as `tools: […]` in the OpenAI/Anthropic/AI SDK request payload, and the same builder is used for structured-output `response_format: { type: 'json_schema', schema }`. |
| `src/core/compose.ts` | `compose(blocks, { tools?, responseSchema?, cache? })` → `Composition`. Renders to ordered `ChatMessage[]`. Handles partial-vars merging, per-block input typing via union/intersection, attaches tool defs and structured-output schemas to the composition for adapters to translate. |
| `src/template-extras/index.ts` | Optional parser extension. Importing this subpath augments the parser at registration time with `{{#if}}`, `{{#each}}`, and `{{> partial}}` support. Core stays at substitution-only when this subpath is not imported. |
| `src/core/template.ts` | Public `render(definition, vars)` plus `extract(definition)` for static analysis. Wraps the internal parser. |
| `src/core/render-context.ts` | Shared context object passed down: variable values, escapers, partials. No public API. |
| `src/core/types.ts` | `PromptDefinition`, `Block`, `Composition`, `ChatMessage`, `Role`, `Metadata`. All plain data, JSON-serializable. |
| `src/types/extract-vars.ts` | `ExtractVariables<T extends string>` recursive template-literal type. Returns a record mapping variable name → declared type token (`'string'` by default, parsed from `{{name:type}}`). |
| `src/types/input-shape.ts` | `InputShape<T, Override>` — merges extracted vars with user override and strips optional vars (`{{name?}}`) into optional keys. |
| `src/types/partial-vars.ts` | Computes "remaining required vars after `.partial()` was applied" so `.render()` is typed against the diff. |
| `src/errors/base.ts` | `abstract class PromptError extends Error { readonly code: ErrorCode; ... }`. `ErrorCode` is a literal union of all error codes. |
| `src/errors/*-error.ts` | Concrete subclasses. Each carries structured context (e.g. `VariableError.missing: string[]`). |
| `src/versioning/registry.ts` | `createRegistry()` — in-memory map keyed by `id`, value is sorted version list. Lookup by exact / range / `'latest'`. Listens to source `change` events when a watch source is attached. |
| `src/versioning/semver.ts` | Local SemVer subset: parse (`major.minor.patch[-pre]`), compare, satisfies(`^x.y.z`, `~x.y.z`, `>=x.y.z`, exact). No support for build metadata or complex AND/OR ranges (out of scope; documented). |
| `src/versioning/selector.ts` | `selectVersion(records, selector)` — pure function, no I/O. |
| `src/testing/ab-test.ts` | `createABTest({ name, variants, identifier, holdout? })`. `assign(ctx)` returns `Assignment<TVariantId>` synchronously. |
| `src/testing/hash.ts` | `fnv1a32(input: string): number` — deterministic, fast, dep-free. |
| `src/testing/allocation.ts` | Validates that weights sum to ≤100, normalizes to buckets `[0, 1)`. |
| `src/testing/traffic.ts` | Holdout (% of users excluded from the test entirely), sticky bucketing helpers (e.g. session-id over user-id fallback). |
| `src/cost/estimate.ts` | `estimateCost({ prompt, vars, model, tokenizer?, expectedOutputTokens? })`. |
| `src/cost/pricing.ts` | Frozen per-model price table snapshot. Tagged with `pricingDate`. |
| `src/cost/pricing-registry.ts` | Mutable map for custom/private models. `registerModel()`, `unregisterModel()`. |
| `src/cost/tokenizer.ts` | Default heuristic: `Math.ceil(text.length / 4)` — **rough**, ~10% under for Latin and up to ~50% over for CJK. Documented prominently. Pluggable `TokenizerFn` type for real tokenizers. |
| `src/cost/tiktoken.ts` | Subpath `@aikit/prompts/cost/tiktoken`. Lazy-loads `js-tiktoken` (peer-optional, not bundled into core). Exposes `tiktokenFor(model)`: returns a `TokenizerFn` callers pass to `estimateCost({ tokenizer })`. |
| `src/sources/memory.ts` | `memorySource(records)` — synchronous; **inlined** into the `sources` barrel (no separate subpath export). |
| `src/sources/http.ts` | `httpSource({ url, fetch?, headers?, ttlMs?, parser?, verify? })` — uses global `fetch`, optional TTL cache, optional integrity verification (`verify: (body, response) => boolean | Promise<boolean>`). |
| `src/sources/verify.ts` | `verifyHmac({ secret, headerName, algorithm? })` — Web Crypto-based HMAC verifier, edge-safe, ready to plug into `httpSource({ verify })`. |
| `src/sources/fs.ts` | `fsSource({ glob, watch?, parser? })` — uses `import('node:fs/promises')` lazily. Throws clear edge-runtime error if `fs` is unavailable. Watching uses `node:fs.watch` with debouncing. |
| `src/sources/parse.ts` | Strict JSON parser for `PromptDefinitionJson`. Schema-validates structure and rejects unknown fields. |
| `src/adapters/openai/index.ts` | `toOpenAI(composition, vars)` → `{ messages: ChatCompletionMessageParam[] }`. Multimodal parts mapped to OpenAI content blocks. |
| `src/adapters/anthropic/index.ts` | `toAnthropic(composition, vars)` → `{ system, messages, metadata? }` matching `MessageCreateParams`. |
| `src/adapters/ai-sdk/index.ts` | `toAISDK(composition, vars)` → `CoreMessage[]` (Vercel AI SDK shape). |
| `src/adapters/langchain/index.ts` | `toLangChain(composition, vars)` → `BaseMessage[]`. Imports types only from `@langchain/core` (peer dep). |
| `src/internal/parser.ts` | Tiny streaming parser (~80 LOC core) returning `TemplateAst`. Core supports `{{var}}`, `{{var?}}`, `{{var:number}}`, and `{{!-- comment --}}` only. Iteration directives (`{{#if}}`, `{{#each}}`, `{{> partial}}`) are added by `template-extras` via a parser-extension hook (`registerDirective(name, handler)`). This keeps the core parser footprint within the 7 KB min+gz target. |
| `src/internal/escape.ts` | Identity by default (LLM input is not HTML). Provides `escapeMarkdown` and `escapeJson` opt-in helpers used by `.render({ escape: 'markdown' })`. |
| `src/internal/invariant.ts` | `invariant(cond, msg)` — throws `PromptError` with code `'INVARIANT'`. Used for unreachable branches. |

---

## 2. Public API Design

> All snippets below are **runnable user code**. They illustrate the final public surface. JSDoc comments are reproduced verbatim from the planned source so the reader can audit the contract.

### 2.1 The `prompt()` builder

```ts
import { prompt } from '@aikit/prompts';

/**
 * Define a versioned, typed prompt template.
 *
 * Variable names declared in the template (with `{{name}}` syntax) are
 * extracted at compile time using template-literal types, so `render()` is
 * fully type-checked against the template body.
 *
 * @param id Stable identifier for this prompt across versions. Unique per registry.
 *
 * @example
 * const greet = prompt('greet.user')
 *   .version('1.0.0')
 *   .template('Hello {{name}}, you have {{count}} new messages.')
 *   .build();
 *
 * greet.render({ name: 'Alice', count: 3 });
 * //                              ^? number — `count` was inferred as a required key
 *
 * greet.render({ name: 'Alice' });
 * //                  ~~~~~~~~~ Type error: missing 'count'
 */
export function prompt(id: string): PromptBuilder;
```

> **DX note.** The exported `PromptBuilder` is a single-arg user-facing alias; the
> three internal generics (`TInput`, `TPartialKeys`, `TVersion`) live on a private
> `_PromptBuilder<TInput, TPartialKeys, TVersion>` type that the builder methods
> return. Hovers show the **resolved** input shape via a `Prettify<T>` mapped type,
> so users never see `PromptBuilder<{}, never, undefined>` in autocomplete — they
> see `PromptBuilder<{ name: string; count: number }>`.

The chainable builder (internal form, simplified for documentation):

```ts
type _PromptBuilder<
  TInput extends Record<string, unknown>,
  TPartialKeys extends keyof TInput,
  TVersion extends string | undefined,
> = {
  /**
   * Attach a SemVer version. Multiple versions of the same `id` can coexist
   * inside a registry; `latest`/range selectors pick between them.
   *
   * @param semver `MAJOR.MINOR.PATCH` — pre-release tags allowed (`1.0.0-beta.1`).
   */
  version<V extends string>(semver: V): _PromptBuilder<TInput, TPartialKeys, V>;

  /**
   * Set the template body. Variable placeholders use `{{name}}` syntax.
   * Optional variables: `{{name?}}`. Typed variables: `{{name:number}}`,
   * `{{name:boolean}}`, `{{items:string[]}}`. Extracted variable names and
   * their types are derived statically — `.render()` will demand exactly
   * those keys with the right types.
   *
   * Subsequent `.template()` calls replace the previous body.
   */
  template<T extends string>(
    body: T,
  ): _PromptBuilder<InputShape<T>, TPartialKeys, TVersion>;

  /**
   * Refine the inferred input shape. Non-destructive by default — the
   * provided override is **intersected** with the template-inferred shape, so
   * you can narrow a single variable to a literal union without restating
   * every key:
   *
   *     prompt('p')
   *       .template('Render at {{size}} for {{user}}')
   *       .input<{ size: 'small' | 'medium' | 'large' }>()
   *       .build()
   *       .render({ size: 'small', user: 'alice' });
   *       //                       ^^^^ still required, still inferred as string
   *
   * To completely replace the inferred shape (rare — typically only when the
   * template references nested object paths the type-extractor cannot follow),
   * use `.replaceInput<T>()` instead.
   */
  input<TOverride extends Partial<TInput>>(): _PromptBuilder<
    Prettify<Omit<TInput, keyof TOverride> & TOverride>,
    Extract<TPartialKeys, keyof (Omit<TInput, keyof TOverride> & TOverride)>,
    TVersion
  >;

  /**
   * Replace the inferred input shape entirely. Destructive — provide every
   * key the template needs. Prefer `.input<T>()` for the common case of
   * narrowing one or two keys; reach for `.replaceInput<T>()` only when the
   * inferred shape is fundamentally wrong (deep nested objects, dynamic key
   * sets, etc.).
   */
  replaceInput<TOverride extends Record<string, unknown>>(): _PromptBuilder<
    TOverride,
    Extract<TPartialKeys, keyof TOverride>,
    TVersion
  >;

  /**
   * Pre-fill a subset of the variables. Returns a new builder where the
   * pre-filled keys are tracked as "partial" — `.render()` omits them from
   * the required-keys check.
   *
   * @example
   * const support = prompt('support.reply')
   *   .version('1.0.0')
   *   .template('You are {{role}}. Answer: {{question}}')
   *   .partial({ role: 'a senior engineer' })
   *   .build();
   *
   * support.render({ question: 'What is TypeScript?' });
   * //                              ^? no `role` required
   */
  partial<TKeys extends keyof TInput>(
    values: Pick<TInput, TKeys>,
  ): _PromptBuilder<TInput, TPartialKeys | TKeys, TVersion>;

  /** Attach arbitrary metadata persisted in the registry and serialized output. */
  metadata(meta: Readonly<Record<string, unknown>>): this;

  /** Attach searchable string tags (`'experimental'`, `'production'`, ...). */
  tags(...tags: string[]): this;

  /**
   * Provide an optional runtime validator. Return an array of error messages
   * (empty array `[]` means "valid") and a non-empty array throws
   * `VariableError` with the messages joined.
   *
   * Note the explicit `readonly string[]` return — there is intentionally no
   * `void` form. Forgetting `return errors` would silently treat any input as
   * valid; requiring the array shape mirrors Zod / Valibot / Effect
   * conventions and makes the contract impossible to forget.
   */
  validate(fn: (vars: TInput) => readonly string[]): this;

  /**
   * Finalize the builder into an immutable `PromptDefinition`. After this
   * call the builder is frozen — further chaining throws `PromptError`.
   */
  build(): PromptDefinition<Prettify<Omit<TInput, TPartialKeys>>, TVersion>;
};

/** Public single-arg alias surfaced in autocomplete. */
export type PromptBuilder<TInput extends Record<string, unknown> = {}> =
  _PromptBuilder<TInput, never, undefined>;

/** Mapped-type identity that flattens intersection chains in editor hovers. */
type Prettify<T> = { [K in keyof T]: T[K] } & {};
```

The output `PromptDefinition`:

```ts
export interface PromptDefinition<
  TVars extends Record<string, unknown> = Record<string, unknown>,
  TVersion extends string | undefined = string | undefined,
> {
  readonly id: string;
  readonly version: TVersion;
  readonly template: string;
  readonly partial: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];

  /**
   * Render the template into a single string with the provided variables.
   * Throws `VariableError` if a required variable is missing.
   */
  render(vars: TVars, options?: RenderOptions): string;

  /**
   * Return the variable names referenced by the template (after partial
   * application). Useful for editor tooling and dynamic UIs.
   */
  variables(): readonly string[];

  /** Serialize to a JSON-safe shape for storage / hot-reload sources. */
  toJSON(): PromptDefinitionJson;
}

export interface RenderOptions {
  /** Default 'none'. 'markdown' escapes `*_~|>#`. 'json' JSON-stringifies values. */
  readonly escape?: 'none' | 'markdown' | 'json';
  /** Strict mode (default true) throws on unknown variables in the input record. */
  readonly strict?: boolean;
}
```

### 2.2 The `block()` builder, `tool()` builder, `compose()`

```ts
import { block, tool, compose } from '@aikit/prompts';

const system = block('system')
  .template('You are a helpful assistant. Persona: {{persona}}.')
  .cacheBreakpoint()                     // anything above this point is a cache prefix
  .build();

const examples = block('user')
  .examples([
    { user: 'Hi', assistant: 'Hello! How can I help?' },
    { user: 'Bye', assistant: 'Goodbye!' },
  ])
  .build();

const userTurn = block('user').template('{{question}}').build();

// First-class tool / function definition (separate from `block('tool')` which
// represents a tool *result* turn in the conversation).
const searchTool = tool({
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

// Optional structured-output schema — adapters translate this into
// OpenAI `response_format: { type: 'json_schema' }` / Anthropic structured
// output / AI SDK `experimental_output: { schema }`.
const responseSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['answer', 'confidence'],
} as const;

const chat = compose([system, examples, userTurn], {
  tools: [searchTool],
  responseSchema,
});

const messages = chat.render({
  persona: 'concise senior engineer',
  question: 'What is a discriminated union?',
});
// messages: ChatMessage[] = [
//   { role: 'system',    content: '...' },
//   { role: 'user',      content: 'Hi' },
//   { role: 'assistant', content: 'Hello! How can I help?' },
//   { role: 'user',      content: 'Bye' },
//   { role: 'assistant', content: 'Goodbye!' },
//   { role: 'user',      content: 'What is a discriminated union?' },
// ]
```

```ts
/**
 * Define a single message block (a turn in the conversation).
 *
 * @param role Conversation role: 'system' | 'user' | 'assistant' | 'tool'.
 */
export function block<R extends Role>(role: R): BlockBuilder<R, {}>;

export interface BlockBuilder<R extends Role, TInput> {
  template<T extends string>(body: T): BlockBuilder<R, InputShape<T>>;
  examples(pairs: ReadonlyArray<{ user: string; assistant: string }>): BlockBuilder<R, TInput>;
  partial<K extends keyof TInput>(vals: Pick<TInput, K>): BlockBuilder<R, Omit<TInput, K>>;

  /**
   * Mark a cache breakpoint at this point in the conversation. Adapters
   * translate this into provider-specific cache hints:
   *
   *   - Anthropic: emits `cache_control: { type: 'ephemeral' }` on the
   *     preceding content block (Anthropic prompt caching).
   *   - OpenAI: marks the preceding prefix as the boundary of a `prompt_cache_key`
   *     shared across requests with identical prefixes (OpenAI prompt caching).
   *   - AI SDK / LangChain: passed through as `providerMetadata` for the underlying
   *     adapter to honor.
   *
   * Up to 4 breakpoints per composition (Anthropic limit). Excess breakpoints
   * collapse to the last 4 with a one-time warning.
   */
  cacheBreakpoint(): BlockBuilder<R, TInput>;

  build(): Block<R, TInput>;
}

/**
 * Define a tool / function the LLM can call. Distinct from `block('tool')`,
 * which represents a tool *result* turn in the conversation.
 *
 * `parameters` is a plain JSON Schema object. Bring-your-own validation:
 * Zod (`zodToJsonSchema(schema)`), Valibot, Effect Schema, or
 * hand-written JSON Schema all work — this lib is provider-agnostic and
 * does not couple to a schema library.
 */
export function tool<TName extends string, TParams = unknown>(
  def: ToolDefinition<TName, TParams>,
): Tool<TName, TParams>;

export interface ToolDefinition<TName extends string, TParams> {
  readonly name: TName;
  readonly description: string;
  readonly parameters: JSONSchema;            // structural JSON Schema
  /**
   * Optional TypeScript type witness. If you pass a `parameters` JSON Schema
   * generated from a Zod schema, you can supply the inferred type here so
   * `Tool<TName, TParams>` carries the input type for downstream adapters.
   */
  readonly _typeWitness?: TParams;
}

export interface Tool<TName extends string, TParams> {
  readonly name: TName;
  readonly description: string;
  readonly parameters: JSONSchema;
  readonly _params?: TParams;                 // phantom — preserved for inference
}

export type JSONSchema = Readonly<Record<string, unknown>>; // structural

/**
 * Compose blocks into a chat-style template.
 *
 * The returned `Composition` aggregates all variables across blocks, so
 * `.render()` requires the union of every block's inputs. Optional
 * `tools` / `responseSchema` / `cache` flow into adapter output.
 */
export function compose<TBlocks extends ReadonlyArray<Block<Role, any>>>(
  blocks: TBlocks,
  options?: ComposeOptions,
): Composition<UnionToIntersection<TBlocks[number] extends Block<Role, infer V> ? V : never>>;

export interface ComposeOptions {
  /** Optional id for the composition (used by registries / observability). */
  readonly id?: string;
  /** Optional semver — composition itself can be versioned. */
  readonly version?: string;
  /** Tool / function definitions adapters should expose to the model. */
  readonly tools?: ReadonlyArray<Tool<string, unknown>>;
  /** Structured-output JSON Schema adapters should attach (`response_format` / equivalent). */
  readonly responseSchema?: JSONSchema;
  /**
   * Composition-level cache configuration. Controls whether `cacheBreakpoint()`
   * marks emit provider hints. Default: `'auto'` (adapters decide based on the
   * provider's caching support).
   */
  readonly cache?: 'auto' | 'off';
}

export interface Composition<TVars extends Record<string, unknown>> {
  readonly id?: string;
  readonly version?: string;
  readonly blocks: readonly Block<Role, unknown>[];
  readonly tools: readonly Tool<string, unknown>[];
  readonly responseSchema?: JSONSchema;
  render(vars: TVars, options?: RenderOptions): readonly ChatMessage[];
  /** Render to a single concatenated string (system + alternating turns joined). */
  renderText(vars: TVars, options?: RenderOptions): string;
  variables(): readonly string[];
}

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  readonly role: Role;
  readonly content: string | readonly MultimodalPart[];
  readonly name?: string;
  readonly toolCallId?: string;
  /** Set when this message ends a `cacheBreakpoint()`-bounded prefix. */
  readonly cacheControl?: 'ephemeral';
}
```

### 2.3 Versioning & registry — `@aikit/prompts/versioning`

The registry has **two creation paths**:

1. **`createTypedRegistry(map)`** (preferred) — pass a record of `{ [id]: PromptDefinition }`. Lookups are typed end-to-end: `registry.get('greet.user')` returns the exact `PromptDefinition<TVars>` you registered, with `TVars` preserved.
2. **`createRegistry(options)`** (escape hatch) — for dynamic / hot-reloaded prompts whose shape isn't statically known. Lookups return `PromptDefinition<Record<string, unknown>>` and the caller asserts the shape.

```ts
import { createTypedRegistry } from '@aikit/prompts/versioning';
import { greetV1, greetV2, greetV3Beta, searchV1 } from './prompts';

const registry = createTypedRegistry({
  'greet.user':  [greetV1, greetV2, greetV3Beta],
  'search.user': [searchV1],
});

const latest = registry.get('greet.user');           // PromptDefinition<{ name: string; count: number }>
//             ^? typed — TVars carried through from greetV1/V2/V3
const v1     = registry.get('greet.user', '1.0.0');  // same TVars
const search = registry.get('search.user');          // PromptDefinition<{ query: string }>
const wrong  = registry.get('nope');                 // ❌ type error: '"nope"' is not assignable to known ids
```

```ts
/**
 * Create a typed prompt registry from a static `{ id → PromptDefinition[] }`
 * map. Lookups are typed end-to-end — `registry.get(id)` returns the precise
 * `PromptDefinition<TVars>` shape that was registered for `id`, and unknown
 * ids are caught at compile time.
 *
 * Use this in application code where prompts are imported (the common case).
 * Use `createRegistry()` for dynamic registries fed by hot-reload sources.
 */
export function createTypedRegistry<
  const TMap extends Record<string, ReadonlyArray<PromptDefinition<any, any>>>,
>(map: TMap, options?: RegistryOptions): TypedPromptRegistry<TMap>;

/**
 * Create a dynamic in-memory prompt registry indexed by `(id, version)`.
 *
 * Loose typing — `get()` returns `PromptDefinition<Record<string, unknown>>`.
 * Prefer `createTypedRegistry()` for statically known prompts.
 */
export function createRegistry(options?: RegistryOptions): PromptRegistry;

export interface RegistryOptions {
  /** Statically registered prompts available immediately. */
  readonly prompts?: ReadonlyArray<PromptDefinition>;
  /** Reject pre-release versions from `'latest'` resolution (default: true). */
  readonly excludePrereleaseFromLatest?: boolean;
}

export interface TypedPromptRegistry<
  TMap extends Record<string, ReadonlyArray<PromptDefinition<any, any>>>,
> {
  /** Look up a prompt by id and an optional selector. Typed in `TMap`. */
  get<K extends keyof TMap & string>(id: K, selector?: string): TMap[K][number];
  /** Like `get`, but returns `undefined` if no version satisfies the selector. */
  find<K extends keyof TMap & string>(id: K, selector?: string): TMap[K][number] | undefined;
  /** All versions of `id` sorted descending. */
  list<K extends keyof TMap & string>(id: K): TMap[K];
  /** All registered prompt ids — narrowed to the keys of `TMap`. */
  ids(): ReadonlyArray<keyof TMap & string>;
  /** Add or replace a prompt at a specific (id, version). */
  register(def: PromptDefinition): void;
  /** Remove a specific (id, version). Returns true if anything was removed. */
  unregister(id: string, version: string): boolean;
  /** Attach a hot-reload source. Returns a synchronous unsubscribe function. */
  addSource(source: PromptSource): () => void;
  /** Subscribe to registry changes (added, replaced, removed). */
  on(event: 'change', listener: (e: RegistryChangeEvent) => void): () => void;
  /** Async cleanup of all attached sources. */
  dispose(): Promise<void>;
}

export interface PromptRegistry {
  /**
   * Look up a prompt by id and an optional selector.
   *
   * Selector forms:
   *   - `undefined` → highest stable version (or pre-release if none).
   *   - `'1.2.3'` → exact match.
   *   - `'^1.2.3'`, `'~1.2.3'`, `'>=1.2.3'`, `'1.x'`, `'*'` → semver range.
   *
   * @throws {VersionError} when no version satisfies the selector.
   *
   * NB: this loose form returns `PromptDefinition<Record<string, unknown>>`.
   * Prefer `createTypedRegistry()` for static maps where the shape is known.
   */
  get(id: string, selector?: string): PromptDefinition;
  /** Same as `get`, but returns `undefined` instead of throwing. */
  find(id: string, selector?: string): PromptDefinition | undefined;
  list(id: string): readonly PromptDefinition[];
  ids(): readonly string[];
  register(def: PromptDefinition): void;
  unregister(id: string, version: string): boolean;
  /** Attach a hot-reload source. Returns a synchronous unsubscribe function. */
  addSource(source: PromptSource): () => void;
  on(event: 'change', listener: (e: RegistryChangeEvent) => void): () => void;
  /** Async cleanup of all attached sources (drains pending watchers, closes sockets). */
  dispose(): Promise<void>;
}
```

### 2.4 A/B testing — `@aikit/prompts/testing`

```ts
import { createABTest } from '@aikit/prompts/testing';
import { searchPromptV1, searchPromptV2 } from './prompts';

const search = createABTest({
  name: 'search-prompt-2026-q2',
  variants: [
    { id: 'control',   prompt: searchPromptV1, weight: 50 },
    { id: 'rephrased', prompt: searchPromptV2, weight: 50 },
  ],
  // Deterministic: the same userId always lands on the same variant
  identifier: (ctx) => ctx.userId ?? ctx.sessionId,
  // Optional: 10% of traffic excluded from the experiment entirely
  holdout: 0.1,
});

const assignment = search.assign({ userId: 'user-42' });
//   ^? Assignment<'control' | 'rephrased', { query: string }>

switch (assignment.kind) {
  case 'variant': {
    const text = assignment.prompt.render({ query: 'TypeScript generics' });
    //                                       ^? typed — every variant in this test
    //                                          is constrained to the same TVars
    // …call your LLM…
    break;
  }
  case 'holdout':
    // user is excluded from the experiment — fall back to your control path
    break;
  case 'unassigned':
    // identifier returned undefined / threw — fall back to your control path
    break;
}
```

```ts
/**
 * Create a deterministic A/B (or A/B/C/...) split test over multiple
 * prompt variants. **All variants must share the same input shape `TVars`** —
 * enforced at the type level so an A/B with mismatched required vars cannot
 * compile. This is the worst class of A/B bug and is statically excluded.
 *
 * Assignment is computed client-side via FNV-1a hashing of the identifier,
 * so the same identifier always lands on the same variant — no network
 * round-trip, no shared store, edge-runtime safe.
 */
export function createABTest<
  TVars extends Record<string, unknown>,
  const TVariants extends ReadonlyArray<VariantDefinition<string, TVars>>,
>(options: ABTestOptions<TVars, TVariants>): ABTest<TVars, TVariants[number]['id']>;

export interface ABTestOptions<
  TVars extends Record<string, unknown>,
  TVariants extends ReadonlyArray<VariantDefinition<string, TVars>>,
> {
  /** Stable name; mixed into the hash so two tests with identical ids segment independently. */
  readonly name: string;
  /** Variant definitions. Weights must sum to <= 100. All variants share `TVars`. */
  readonly variants: TVariants;
  /** Pure function returning a string used to bucket the user. */
  readonly identifier: (ctx: AssignmentContext) => string | undefined;
  /** Fraction of users excluded from the test entirely (returned as `kind: 'holdout'`). */
  readonly holdout?: number;
  /** Optional override for the hash function (default: FNV-1a 32). */
  readonly hash?: (input: string) => number;
}

export interface VariantDefinition<
  TId extends string,
  TVars extends Record<string, unknown>,
> {
  readonly id: TId;
  readonly prompt: PromptDefinition<TVars>;
  readonly weight: number; // 0 < weight <= 100
}

export interface ABTest<
  TVars extends Record<string, unknown>,
  TVariantId extends string,
> {
  readonly name: string;
  assign(ctx: AssignmentContext): Assignment<TVariantId, TVars>;
  /** Pure preview helper: returns the deterministic bucket [0,1) for the identifier. */
  bucket(ctx: AssignmentContext): number;
}

/**
 * Discriminated on `kind`, NOT on `variant`, so that user-chosen variant ids
 * (including `'holdout'` or `'unassigned'`) cannot collide with the special
 * cases. Switch on `assignment.kind` for exhaustive narrowing.
 */
export type Assignment<
  TVariantId extends string,
  TVars extends Record<string, unknown>,
> =
  | { readonly kind: 'variant';    readonly id: TVariantId; readonly prompt: PromptDefinition<TVars>; readonly bucket: number }
  | { readonly kind: 'holdout';    readonly bucket: number }
  | { readonly kind: 'unassigned'; readonly bucket: -1; readonly reason: 'no-identifier' | 'identifier-threw'; readonly cause?: unknown };

export interface AssignmentContext {
  readonly userId?: string;
  readonly sessionId?: string;
  readonly [key: string]: unknown;
}
```

### 2.5 Cost estimation — `@aikit/prompts/cost`

> **Honesty about the heuristic.** The default tokenizer is `Math.ceil(text.length / 4)` —
> roughly correct for English, ~10% under for Latin scripts, and up to ~50% over for
> CJK. That is **fine for ballparking** ("which prompt version is roughly cheaper")
> and **wrong for billing-grade accounting**. Use the optional `@aikit/prompts/cost/tiktoken`
> subpath for production-accurate counts.
>
> The API names reflect this: `estimateCost()` and `estimateTokens()`. Callers who
> want a clear "this is a rough number" signal at the call site can use the
> `roughCost()` alias re-exported from `@aikit/prompts/cost`.

```ts
import { estimateCost, estimateTokens, registerModel } from '@aikit/prompts/cost';
import { tiktokenFor } from '@aikit/prompts/cost/tiktoken'; // optional, peer-deps `js-tiktoken`
import { greet } from './prompts';

// Heuristic (default — rough, no extra deps)
const rough = estimateCost({
  prompt: greet,
  vars: { name: 'Alice', count: 3 },
  model: 'gpt-4o',
  expectedOutputTokens: 200,
});
// rough: { inputTokens: 12, outputTokens: 200, inputCostUSD: 0.00006, outputCostUSD: 0.003,
//          totalUSD: 0.00306, currency: 'USD', pricingDate: '2026-04-27',
//          tokenizer: 'heuristic-4cpt', accuracy: 'rough' }

// Production-accurate (opt-in)
const accurate = estimateCost({
  prompt: greet,
  vars: { name: 'Alice', count: 3 },
  model: 'gpt-4o',
  expectedOutputTokens: 200,
  tokenizer: tiktokenFor('gpt-4o'),
});
// accurate.tokenizer === 'tiktoken/cl100k_base', accurate.accuracy === 'exact'

// Token counts only (no pricing required)
const t = estimateTokens({ prompt: greet, vars: { name: 'A', count: 1 } });

// Custom / private model:
registerModel('internal-llama-70b', {
  inputUSDPer1M: 0.5,
  outputUSDPer1M: 1.5,
});
```

```ts
/**
 * Estimate input/output token counts and dollar cost for a (prompt, vars, model) tuple.
 *
 * Generic in `TVars` so the `vars` argument is type-checked against the
 * prompt's input shape — no `Record<string, unknown>` widening.
 *
 * @param expectedOutputTokens Optional. Defaults to 0 (input cost only).
 * @param tokenizer Optional. Defaults to a 4 chars/token heuristic. Pass
 *   `tiktokenFor(model)` from `@aikit/prompts/cost/tiktoken` for accurate counts.
 */
export function estimateCost<TVars extends Record<string, unknown>>(
  args: EstimateCostArgs<TVars>,
): CostEstimate;

/** Alias of `estimateCost` — name signals to the call site that the result is a heuristic. */
export const roughCost: typeof estimateCost;

/** Tokens-only counterpart. Same generic, no pricing/model required. */
export function estimateTokens<TVars extends Record<string, unknown>>(
  args: EstimateTokensArgs<TVars>,
): TokenEstimate;

export interface EstimateCostArgs<TVars extends Record<string, unknown>> {
  readonly prompt: PromptDefinition<TVars> | Composition<TVars>;
  readonly vars: TVars;
  readonly model: string;
  readonly expectedOutputTokens?: number;
  readonly tokenizer?: TokenizerFn;
}

export interface EstimateTokensArgs<TVars extends Record<string, unknown>> {
  readonly prompt: PromptDefinition<TVars> | Composition<TVars>;
  readonly vars: TVars;
  readonly tokenizer?: TokenizerFn;
}

export interface CostEstimate {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly inputCostUSD: number;
  readonly outputCostUSD: number;
  readonly totalUSD: number;
  readonly currency: 'USD';
  readonly model: string;
  readonly pricingDate: string;
  readonly tokenizer: string;        // identifier ('heuristic-4cpt', 'tiktoken/cl100k_base', …)
  readonly accuracy: 'rough' | 'exact';
}

export interface TokenEstimate {
  readonly inputTokens: number;
  readonly tokenizer: string;
  readonly accuracy: 'rough' | 'exact';
}

export type TokenizerFn = ((text: string, model: string) => number) & {
  readonly id?: string;
  readonly accuracy?: 'rough' | 'exact';
};

/** Add or override pricing for a model. */
export function registerModel(model: string, pricing: ModelPricing): void;
export function unregisterModel(model: string): boolean;
export function listModels(): readonly string[];

export interface ModelPricing {
  readonly inputUSDPer1M: number;
  readonly outputUSDPer1M: number;
  /** Optional: per-1M token price for cached input under prompt-caching. */
  readonly cachedInputUSDPer1M?: number;
}
```

```ts
// @aikit/prompts/cost/tiktoken — opt-in subpath, peer-optional `js-tiktoken`.
export function tiktokenFor(model: string): TokenizerFn;
```

### 2.6 Sources — `@aikit/prompts/sources*`

> **Layout note.** `memorySource` is exported from the universal `@aikit/prompts/sources`
> barrel — it is too small (~200 B minified) to justify a dedicated subpath. Edge-safe
> network sources live at `@aikit/prompts/sources/http`. Node-only filesystem sources
> live at `@aikit/prompts/sources/fs` (lazy-loaded behind `await import('node:fs/promises')`).
>
> **Trust boundary.** Hot-reloading prompts from a URL is effectively remote
> code execution into the LLM context. TLS protects the wire, but the KV/CDN
> provider itself is in the threat model. `httpSource` accepts a `verify`
> callback for HMAC / Ed25519 / Sigstore verification, and ships a built-in
> `verifyHmac()` helper using Web Crypto (universal across edge runtimes).

```ts
import { createRegistry } from '@aikit/prompts/versioning';
import { memorySource, verifyHmac } from '@aikit/prompts/sources';
import { httpSource } from '@aikit/prompts/sources/http';
import { fsSource } from '@aikit/prompts/sources/fs';

const registry = createRegistry();

const unsubHttp = registry.addSource(
  httpSource({
    url: 'https://kv.example.com/prompts.json',
    ttlMs: 60_000,
    headers: { authorization: `Bearer ${env.PROMPT_TOKEN}` },
    verify: verifyHmac({
      secret: env.PROMPT_SIGNING_SECRET,
      headerName: 'x-prompt-signature',
      algorithm: 'SHA-256',
    }),
  }),
);

// Node-only example:
const unsubFs = registry.addSource(
  fsSource({
    glob: './prompts/**/*.json',
    watch: true,                 // hot reload on file change
  }),
);

// React-style cleanup is sync — no `void promise` dance:
useEffect(() => unsubHttp, []);

// When tearing down the registry:
await registry.dispose();        // drains async cleanup of all sources
```

```ts
export interface PromptSource {
  readonly name: string;
  /** Initial load. Returns all prompts known to this source. */
  load(): Promise<readonly PromptDefinitionJson[]>;
  /**
   * Optional subscription. If provided, the registry will call it once per
   * source and forward each emission to its `change` listeners.
   *
   * The returned unsubscribe is **synchronous** — React `useEffect` cleanup,
   * `finally` blocks, and signal handlers can call it directly. If a source
   * needs to flush async I/O during teardown, expose `dispose()` separately.
   */
  subscribe?(listener: (event: SourceChangeEvent) => void): () => void;
  /** Optional async cleanup invoked by `registry.dispose()`. */
  dispose?(): Promise<void>;
}

export type SourceChangeEvent =
  | { type: 'added';    prompt: PromptDefinitionJson }
  | { type: 'replaced'; prompt: PromptDefinitionJson }
  | { type: 'removed';  id: string; version: string }
  | { type: 'error';    error: SourceError };

/** Inlined into the universal `@aikit/prompts/sources` barrel — no subpath. */
export function memorySource(records: readonly PromptDefinitionJson[]): PromptSource;

export function httpSource(options: HttpSourceOptions): PromptSource;
export interface HttpSourceOptions {
  readonly url: string;
  readonly fetch?: typeof fetch;
  readonly headers?: HeadersInit;
  readonly ttlMs?: number;
  readonly parser?: (raw: unknown) => readonly PromptDefinitionJson[];
  /**
   * Integrity check applied to every successful fetch. Return `false` (or a
   * rejected promise) to reject the body — the source emits a `change` event
   * of `type: 'error'` with `code: SOURCE_INTEGRITY_FAILED` and the previous
   * load remains in effect.
   */
  readonly verify?: VerifyFn;
}

export type VerifyFn = (body: string, response: Response) => boolean | Promise<boolean>;

/**
 * Built-in HMAC verifier. Uses Web Crypto (`SubtleCrypto`) so it works in
 * Node 18+, Bun, Deno, browsers, Vercel Edge, and Cloudflare Workers without
 * pulling `node:crypto`.
 */
export function verifyHmac(options: {
  readonly secret: string | ArrayBuffer | CryptoKey;
  readonly headerName: string;                    // e.g. 'x-prompt-signature'
  readonly algorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512';   // default 'SHA-256'
  readonly encoding?: 'hex' | 'base64' | 'base64url';        // default 'hex'
}): VerifyFn;

export function fsSource(options: FsSourceOptions): PromptSource;
export interface FsSourceOptions {
  readonly glob: string;
  readonly watch?: boolean;
  readonly parser?: (raw: string, path: string) => PromptDefinitionJson;
}
```

### 2.7 Adapters — `@aikit/prompts/adapters/*`

```ts
import OpenAI from 'openai';
import { toOpenAI } from '@aikit/prompts/adapters/openai';

const params = toOpenAI(chat, { persona: 'senior', question: 'Why TS?' });
const completion = await new OpenAI().chat.completions.create({
  model: 'gpt-4o',
  ...params,
});
```

```ts
/**
 * All adapters are generic in the prompt's input shape `TVars`. The `vars`
 * argument is type-checked against the prompt definition — no
 * `Record<string, unknown>` widening at the adapter boundary.
 *
 * Adapters carry through tool definitions (`composition.tools`),
 * structured-output schemas (`composition.responseSchema`), and cache
 * breakpoints (`block.cacheBreakpoint()`) into provider-specific shapes.
 */
export function toOpenAI<TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
  vars: TVars,
): {
  messages: OpenAIChatMessage[];
  tools?: OpenAIToolParam[];                   // emitted when composition.tools is non-empty
  response_format?: OpenAIResponseFormat;      // emitted when composition.responseSchema is set
  prompt_cache_key?: string;                   // hash of the cache-prefix when cacheBreakpoint() is used
};

export function toAnthropic<TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
  vars: TVars,
): {
  system?: string | AnthropicTextBlock[];      // arrays carry per-block cache_control
  messages: AnthropicMessage[];                // content blocks may carry cache_control: { type: 'ephemeral' }
  tools?: AnthropicToolParam[];
  // Anthropic structured output: passed via tool_choice forced-call pattern when responseSchema set.
};

export function toAISDK<TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
  vars: TVars,
): {
  messages: AISDKCoreMessage[];
  tools?: Record<string, AISDKToolDef>;
  experimental_output?: { schema: JSONSchema };
  providerOptions?: Record<string, unknown>;   // includes cache hints
};

export function toLangChain<TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
  vars: TVars,
): BaseMessage[];
```

Adapters import provider types **only** via `import type`, so the adapters work without the SDK installed at runtime — they just shape data.

> **MCP (Model Context Protocol) — v0.2 milestone.** A `toMCP()` adapter that
> emits the MCP prompt-template envelope (`prompts/get` response shape with
> typed `arguments` derived from `TVars`) is planned for the v0.2 release. Not
> v0.1: the MCP spec is still consolidating in 2026 and we want to ship
> against the stabilized 1.x prompt resource shape rather than chase the
> draft. Tracked in §11.

### 2.8 Result helper for predictable failures

```ts
import { type Result, isOk, isErr } from '@aikit/prompts';

const r: Result<string, VariableError> = greet.tryRender({ name: 'A' });
if (isErr(r)) console.error(r.error.code, r.error.missing);
```

```ts
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;
```

`PromptDefinition` and `Composition` both expose a `tryRender()` mirror of `render()` that returns a `Result` instead of throwing. See §5.

---

## 3. Internal Architecture

### 3.1 Module dependency graph

```
                       ┌──────────────┐
                       │  src/index   │   ← root barrel
                       └──────┬───────┘
                              │
                              ▼
                       ┌──────────────┐
                       │  core/*      │   ← prompt, block, compose
                       └──┬─────┬─────┘
                          │     │
        ┌─────────────────┘     └──────────────┐
        ▼                                      ▼
  ┌──────────────┐                       ┌──────────────┐
  │  types/*     │                       │  internal/*  │
  │ (TS only)    │                       │  parser, ast │
  └──────────────┘                       └──────────────┘
                                                ▲
                                                │
   ┌───────────────────┬────────────────────────┴──────┬───────────────┐
   │                   │                               │               │
   ▼                   ▼                               ▼               ▼
┌──────────┐    ┌────────────┐                ┌─────────────┐   ┌─────────────┐
│ errors/* │    │versioning/*│                │  testing/*  │   │   cost/*    │
└──────────┘    └─────┬──────┘                └──────┬──────┘   └──────┬──────┘
   ▲                  │                              │                 │
   │                  ▼                              │                 │
   │            ┌────────────┐                       │                 │
   │            │  sources/* │                       │                 │
   │            └────────────┘                       │                 │
   │                                                 │                 │
   │            ┌────────────┐                       │                 │
   └────────────┤ adapters/* │◀──────────────────────┘                 │
                └────────────┘                                         │
                       ▲                                               │
                       └───────────────────────────────────────────────┘
```

**Strict layering rules:**

- `internal/*` and `types/*` have **zero dependencies on other src modules**.
- `core/*` may depend on `internal/*`, `types/*`, `errors/*`. **No** dependency on versioning/testing/cost/sources/adapters.
- `errors/*` depends only on `types/*`.
- `versioning/*`, `testing/*`, `cost/*` may depend on `core/*` and `errors/*`. **No** mutual dependencies.
- `sources/*` may depend on `core/*` and `errors/*` (for `PromptDefinitionJson` shape) but **not** on `versioning/*`. The registry pulls from sources, not vice versa.
- `adapters/*` may depend on `core/*` and `errors/*`. **No** dependency on versioning/testing/cost/sources.

A test in `tests/internal/dependency-graph.test.ts` will programmatically scan `src/` and assert these boundaries (regex over `import` statements).

### 3.2 Data flow

**Build-time → render-time pipeline:**

```
template-string
       │
       │  (compile time)
       ▼
ExtractVariables<T>  ─►  required input keys (TS only, erased at runtime)
       │
       │  (build time, single pass)
       ▼
parser.ts ──► TemplateAst (cached on the PromptDefinition)
       │
       │  (every .render() call)
       ▼
renderAst(ast, vars, partial, options)
       │
       ▼
   string  (or per-block ChatMessage in Composition)
```

The AST is parsed **once** at `.build()` time and stored on the immutable `PromptDefinition`. `render()` walks the AST without re-parsing. Cost ≈ O(N) where N is template length; benchmark target: > 1M renders/sec for ~200-char templates on M-class CPUs.

**A/B assignment flow:**

```
ctx → identifier(ctx) → "stable-id"
                            │
                            ▼
                    fnv1a32(testName + "::" + id) → uint32
                            │
                            ▼
                    bucket = uint32 / 2^32  ∈ [0, 1)
                            │
                            ▼
                    if bucket < holdout: return 'holdout'
                            │
                            ▼
                    walk variants by cumulative weight → variant
```

**Hot-reload flow:**

```
PromptSource.load()  ─►  PromptDefinitionJson[]
                              │
                              ▼
                     parse + validate + freeze
                              │
                              ▼
                     reconstruct PromptDefinition
                              │
                              ▼
                     registry.register(def)
                              │
                              ▼
                     emit('change', { type, id, version })
```

### 3.3 Key design patterns

| Pattern | Where | Why |
|---|---|---|
| **Builder + freeze** | `prompt()`, `block()`, `compose()` | Chainable DX during definition; immutable `PromptDefinition` after `.build()`. Frozen via `Object.freeze` so mutating consumers fail loudly. |
| **Discriminated union** | `Result`, `SourceChangeEvent`, `Assignment`, `TemplateAst` node types | Forces exhaustive handling; `switch` on the discriminant is type-narrowed automatically. |
| **Tagged error hierarchy** | `errors/*` | Single `instanceof PromptError` check in user code; `error.code` literal union enables exhaustive switching on specific failure modes. |
| **Pure function core, side-effects at the edges** | `template`, `semver`, `selector`, `hash`, `allocation` are pure; only `sources/*` and `registry.addSource` carry I/O | Trivial to test, edge-runtime safe, deterministic. |
| **Strategy via function injection** | `tokenizer?` in `estimateCost`, `hash?` in `createABTest`, `parser?` in sources | No abstract classes; users plug in functions. Keeps bundle small. |
| **Lazy import for Node-only code** | `sources/fs.ts` calls `await import('node:fs/promises')` inside `load()` | Edge bundlers won't include the Node module unless the subpath is explicitly imported. |
| **Subpath exports as the API contract** | `package.json#exports` | Matches the strict layering rules — bundlers tree-shake by import boundary, not by named export. |

---

## 4. Type System

### 4.1 Variable extraction from template literal types

```ts
// src/types/extract-vars.ts

/**
 * Walk a template-literal type, extracting every `{{var}}` placeholder
 * and folding it into a record of name → declared TypeScript type.
 *
 * Recognized syntax inside `{{ ... }}`:
 *   - `name`              → required string
 *   - `name?`             → optional string
 *   - `name:string`       → required string (explicit)
 *   - `name:number`       → required number
 *   - `name:boolean`      → required boolean
 *   - `name:string[]`     → required string[]
 *   - `name?:number`      → optional number
 *
 * Whitespace inside `{{ ... }}` is tolerated.
 */
export type ExtractVariables<T extends string> =
  T extends `${string}{{${infer Token}}}${infer Rest}`
    ? Trim<Token> extends `${infer NameRaw}:${infer TypeRaw}`
      ? VarEntry<NameRaw, TypeRaw> & ExtractVariables<Rest>
      : Trim<Token> extends `${infer Name}?`
        ? { [K in Trim<Name>]?: string } & ExtractVariables<Rest>
        : { [K in Trim<Token>]: string } & ExtractVariables<Rest>
    : {};

type VarEntry<NameRaw extends string, TypeRaw extends string> =
  Trim<NameRaw> extends `${infer Name}?`
    ? { [K in Trim<Name>]?: TypeOf<Trim<TypeRaw>> }
    : { [K in Trim<NameRaw>]: TypeOf<Trim<TypeRaw>> };

type TypeOf<S extends string> =
  S extends 'string'   ? string  :
  S extends 'number'   ? number  :
  S extends 'boolean'  ? boolean :
  S extends 'string[]' ? string[]:
  S extends 'number[]' ? number[]:
  S extends 'boolean[]'? boolean[]: string;

type Trim<S extends string> =
  S extends ` ${infer R}` ? Trim<R> :
  S extends `${infer R} ` ? Trim<R> : S;
```

`InputShape<T>` is `Prettify<ExtractVariables<T>>` (a `{ [K in keyof X]: X[K] }` mapped type that flattens the intersection chain in editor hovers).

### 4.2 Partial application typing

```ts
// src/types/partial-vars.ts

/**
 * After `.partial({ a: 1 })`, the remaining required input is
 * `Omit<TInput, 'a'>`. We track partial keys at the type level so that
 * `.render()` only asks for what's missing.
 */
export type RemainingInput<TInput, TPartialKeys extends keyof TInput> =
  Omit<TInput, TPartialKeys>;
```

The builder threads `TPartialKeys extends keyof TInput` through every method, accumulating in a union. `.build()` returns `PromptDefinition<RemainingInput<TInput, TPartialKeys>>`.

### 4.3 Composition variable union

```ts
type UnionToIntersection<U> =
  (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

// compose([a, b, c]) where a:Block<_, A>, b:Block<_, B>, c:Block<_, C>
// → Composition<A & B & C>
```

This means a `Composition` requires the **union** of every child block's variables — TypeScript surfaces a missing var even if it lives in one block buried at index 7.

### 4.4 Strict mode at the type level

`tsconfig.json` enables:
- `strict: true`
- `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`
- `noFallthroughCasesInSwitch: true`
- `noPropertyAccessFromIndexSignature: true`
- `useDefineForClassFields: true`

With `exactOptionalPropertyTypes`, `{{name?}}` extracts to `{ name?: string }` rather than `{ name: string | undefined }` — the difference matters for callers using object spread.

### 4.5 Type-level test coverage

`tests/types/*.test-d.ts` files use Vitest's `--typecheck` mode plus `expectTypeOf` to assert:

- `ExtractVariables<'Hello {{name}}'>` is `{ name: string }`
- `ExtractVariables<'A {{x:number}} B {{y?}}'>` is `{ x: number; y?: string }`
- `prompt('p').template('{{a}}').build().render({ b: 1 })` is a type error
- `compose([a, b])` requires `A & B` and surfaces missing keys from `b`
- `.partial({ x: 1 })` removes `x` from the render-required set
- `createABTest({ variants: [...] }).assign(...).variant` is `'control' | 'treatment' | 'holdout' | 'unassigned'` (no widening)

These tests fail the build if a refactor accidentally widens the inferred type to `Record<string, string>`.

---

## 5. Error Handling Strategy

### 5.1 Error class hierarchy

```ts
// src/errors/base.ts
export type ErrorCode =
  | 'INVARIANT'
  | 'TEMPLATE_PARSE'
  | 'TEMPLATE_UNCLOSED_TAG'
  | 'TEMPLATE_UNKNOWN_DIRECTIVE'
  | 'VARIABLE_MISSING'
  | 'VARIABLE_TYPE_MISMATCH'
  | 'VARIABLE_VALIDATION_FAILED'
  | 'VERSION_INVALID'
  | 'VERSION_NOT_FOUND'
  | 'VERSION_RANGE_INVALID'
  | 'AB_TEST_INVALID_WEIGHTS'
  | 'AB_TEST_DUPLICATE_VARIANT'
  | 'AB_TEST_NO_IDENTIFIER'
  | 'COST_UNKNOWN_MODEL'
  | 'COST_INVALID_TOKEN_COUNT'
  | 'SOURCE_LOAD_FAILED'
  | 'SOURCE_PARSE_FAILED'
  | 'SOURCE_FS_UNAVAILABLE'
  | 'SOURCE_INTEGRITY_FAILED'
  | 'REGISTRY_DUPLICATE'
  | 'BUILDER_FROZEN'
  | 'TOOL_INVALID_SCHEMA'
  | 'CACHE_BREAKPOINT_LIMIT';

export abstract class PromptError extends Error {
  abstract readonly code: ErrorCode;
  override readonly name: string = 'PromptError';
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype); // safe instanceof across realms
  }
}
```

Subclasses carry structured context, e.g.:

```ts
export class VariableError extends PromptError {
  readonly code = 'VARIABLE_MISSING' satisfies ErrorCode;
  constructor(
    readonly missing: readonly string[],
    readonly templateId?: string,
  ) {
    super(`Missing required template variables: ${missing.join(', ')}`);
  }
}

export class VersionError extends PromptError {
  readonly code: 'VERSION_INVALID' | 'VERSION_NOT_FOUND' | 'VERSION_RANGE_INVALID';
  constructor(code: VersionError['code'], message: string, readonly id?: string, readonly selector?: string) {
    super(message);
    this.code = code;
  }
}
```

### 5.2 Throw vs. Result

| Situation | Convention |
|---|---|
| Programmer error (calling `.render()` on a frozen builder, weights summing to 200%, unknown error code) | **Throw** synchronously. These are bugs to fix at dev time, not handled at runtime. |
| Predictable runtime failure with a sensible recovery path (missing variable from a dynamic vars object, version not found in a hot-loaded registry, source HTTP 404) | Provide both: `render()` throws `VariableError`; **also** `tryRender()` returns `Result<string, VariableError>`. Same for `registry.get` (throws) vs `registry.find` (returns `undefined`). |
| Async I/O inside `sources/*` | Wrap network/disk failures as `SourceError` with `cause: originalError` preserved. The registry **does not throw** during `addSource()` start-up — failures are emitted as `change` events of type `'error'` so the registry stays usable for sources that did succeed. |
| User-supplied callback throws (custom tokenizer, parser, validator) | Catch and rethrow wrapped in the appropriate domain error (`CostError`, `SourceError`, `VariableError`) with `cause` set, so the stack still points at the user code. |

### 5.3 Error messages

Every thrown error includes:
1. The human-readable message.
2. The `code` (for programmatic handling).
3. Structural context (missing keys, the offending version string, the source name).
4. A docs-link suffix appended unless `NODE_ENV === 'production'` (e.g. `(see https://github.com/j09822475-dev/aikit-prompts/blob/main/docs/errors.md#variable_missing)`). The check is **edge-safe**:
   ```ts
   const isProd =
     typeof process !== 'undefined' &&
     typeof process.env !== 'undefined' &&
     process.env.NODE_ENV === 'production';
   ```
   No `npm config` invocation (that is a build-time CLI, not a runtime API), no bare `process.env` access (Cloudflare Workers and Vercel Edge throw `ReferenceError` on undefined `process`). When in doubt, including the docs link is the safer default — the noise is worth it for debugging.

### 5.4 Strictness toggles

`render(vars, { strict: false })` downgrades **unknown variables** in the input record from a thrown error to a console warning (suppressible in production). It does **not** loosen **missing required** variables — those always throw, since silently rendering `"Hello "` is worse than failing fast.

---

## 6. Bundle & Tree-shaking Plan

### 6.1 Entry points (`package.json#exports`)

> All sizes are **minified + gzip** as measured by `size-limit` with
> `@size-limit/preset-small-lib` (its default). The preset reports gzip;
> stating "min" alone would be misleading. CI fails the build on any cap breach.

| Subpath | Files included | Size budget (min+gz) |
|---|---|---|
| `.` | `core/*` (without iteration directives), `types/*`, `internal/*`, `errors/base` | **7 KB** target, 9 KB hard cap |
| `./template-extras` | `{{#if}}`, `{{#each}}`, `{{> partial}}` parser extension | 2 KB |
| `./errors` | All concrete error classes | 0.6 KB |
| `./versioning` | `versioning/*`, depends on `.` | 1.5 KB |
| `./testing` | `testing/*`, depends on `.` | 1 KB |
| `./cost` | `cost/*` (heuristic only), depends on `.` | 2 KB (most weight is the pricing table) |
| `./cost/tiktoken` | Lazy `js-tiktoken` adapter (peer-optional) | 0.4 KB (the wrapper; `js-tiktoken` itself is a peer) |
| `./sources` | Universal barrel: `memorySource`, `verifyHmac` | 0.6 KB |
| `./sources/http` | Edge-safe http source with `verify` hook | 0.9 KB |
| `./sources/fs` | Node-only fs source | 1 KB |
| `./adapters/openai` | OpenAI shaping (msgs + tools + response_format + cache key) | 0.8 KB |
| `./adapters/anthropic` | Anthropic shaping (msgs + tools + cache_control) | 0.8 KB |
| `./adapters/ai-sdk` | Vercel AI SDK shaping | 0.7 KB |
| `./adapters/langchain` | LangChain compat | 0.6 KB |
| `./package.json` | (resolution support) | — |

> **Why the budget changed.** Vasyl correctly flagged that 9 KB *minified* (the
> previous wording) for a parser supporting iteration directives, partials,
> compose-time variable union, deep-equal, freeze plumbing, and the `Result`
> helpers was unrealistic. Resolution: (a) state caps as min+gz to match
> `size-limit`'s default, (b) move iteration to `template-extras` so the core
> parser stays substitution-only, (c) carve out `cost/tiktoken` so `js-tiktoken`
> never lands in core. Result: a credible 7 KB min+gz core.

### 6.2 Tree-shaking guarantees

- `package.json#sideEffects: false` — bundlers can drop unused exports.
- Every barrel uses `export { ... } from './x'` (named re-exports), never `export * from`.
- No top-level `new SomeClass()`, `console.log()`, or other side-effects at module load.
- The pricing table is exported as a **frozen object literal**, not a class instance — the bundler can keep only the keys you reference if you import them by name. (`pricing-registry.ts` mutates a separate object, so static imports stay shakeable.)
- Adapters use `import type` for provider SDK types so adapters work without the SDK at runtime, AND so the SDK is never bundled.
- `sources/fs.ts` uses `await import('node:fs/promises')` inside the `load()` function, so edge bundlers (Wrangler, Vercel) won't pull `node:fs` unless that subpath is statically imported.

### 6.3 Build tool

`tsup` with multi-entry config:

```ts
// tsup.config.ts (sketch — written during implementation)
export default defineConfig({
  entry: {
    index:                       'src/index.ts',
    'template-extras/index':     'src/template-extras/index.ts',
    'errors/index':              'src/errors/index.ts',
    'versioning/index':          'src/versioning/index.ts',
    'testing/index':             'src/testing/index.ts',
    'cost/index':                'src/cost/index.ts',
    'cost/tiktoken':             'src/cost/tiktoken.ts',
    'sources/index':             'src/sources/index.ts',
    'sources/http':              'src/sources/http.ts',
    'sources/fs':                'src/sources/fs.ts',
    'adapters/openai/index':     'src/adapters/openai/index.ts',
    'adapters/anthropic/index':  'src/adapters/anthropic/index.ts',
    'adapters/ai-sdk/index':     'src/adapters/ai-sdk/index.ts',
    'adapters/langchain/index':  'src/adapters/langchain/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,           // keep readable; consumers' bundlers minify
  treeshake: true,
  splitting: false,        // each subpath is its own bundle
  target: 'es2022',
  external: [
    'ai', 'openai', '@anthropic-ai/sdk', '@langchain/core',
    'js-tiktoken',                          // peer-optional, only loaded by cost/tiktoken
    'node:fs/promises', 'node:fs',
  ],
});
```

`size-limit` runs in CI and fails the build if any limit in `package.json#size-limit` is exceeded.

### 6.4 Verification tools

- `publint` — validates the `exports` map and dual-package layout.
- `@arethetypeswrong/cli` — verifies that types resolve correctly for every subpath in both Node and bundler contexts.
- `vitest` runs in two pools: default Node and a Workers pool (`@cloudflare/vitest-pool-workers`) limited to edge-safe modules to confirm they don't accidentally import `node:*`.

---

## 7. Dependencies

### 7.1 Runtime dependencies — **none**

The library targets the union of Node 18+, Bun, Deno, browsers, Vercel Edge, and Cloudflare Workers. The only universally available primitives we need are:

- `String`, `Array`, `Map`, `Set`, `Object.freeze`, `Promise`, `Symbol` → built-in.
- `fetch`, `Headers`, `Request`, `Response` → universal as of Node 18.
- `TextEncoder`, `TextDecoder` → universal.

Every additional dep would either:
- Inflate the bundle (LangChain's lesson).
- Constrain the runtime matrix (Node-only crypto, fs).
- Drag a transitive license/audit burden onto every consumer.

The bundle-size discipline is the headline differentiator vs. LangChain's PromptTemplate. Adding even a SemVer dep (`semver` is ~30 KB) would forfeit it. We re-implement a strict subset of SemVer (~80 LOC, ~700 B minified).

### 7.2 Peer dependencies (optional)

| Package | Why peer | Required by |
|---|---|---|
| `ai` | Vercel AI SDK shapes | `./adapters/ai-sdk` |
| `openai` | OpenAI message types | `./adapters/openai` (types only — no runtime import) |
| `@anthropic-ai/sdk` | Anthropic message types | `./adapters/anthropic` (types only) |
| `@langchain/core` | `BaseMessage` | `./adapters/langchain` |

All four are marked `peerDependenciesMeta.<pkg>.optional = true` so installing the lib without them is silent. Adapters that only use provider types via `import type` work even at runtime without the SDK installed — they are pure data-shape mappers.

### 7.3 Dev dependencies (build/test only)

Standard set for the portfolio: `tsup`, `typescript`, `vitest`, `@vitest/coverage-v8`, `eslint`, `@typescript-eslint/*`, `prettier`, `size-limit`, `@size-limit/preset-small-lib`, `publint`, `@arethetypeswrong/cli`, `@types/node`. Provider SDKs are listed under devDeps to give the type-checker the real shapes during development.

---

## 8. Configuration

### 8.1 `tsconfig.json` (root)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useDefineForClassFields": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

### 8.2 `tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test-d.ts", "tests", "examples", "benchmarks"]
}
```

### 8.3 `vitest.config.ts`

- `test.environment: 'node'`
- `test.typecheck.enabled: true`, `test.typecheck.include: ['tests/types/**/*.test-d.ts']`
- `test.coverage`: V8 reporter, threshold `lines/branches/functions/statements: 90%`.
- Workers pool project for `tests/edge/**` (smoke tests for edge-safe modules) using `@cloudflare/vitest-pool-workers`.

### 8.4 `package.json` highlights

- `name: '@aikit/prompts'`, `version: '0.1.0'`, `type: 'module'`, `sideEffects: false`.
- Comprehensive `exports` map matching §6.1.
- `engines.node: '>=18.17.0'`.
- `publishConfig.access: 'public'`, `provenance: true`.
- `size-limit` block enforcing per-subpath budgets.
- `prepublishOnly` runs lint → typecheck → test → build → publint → attw → size.

---

## 9. Edge Cases the Implementation Must Handle

### 9.1 Template parsing
1. Empty template (`''`) — valid, renders to `''`, `variables()` returns `[]`.
2. Template with no variables — render() ignores the `vars` argument shape.
3. Adjacent variables (`{{a}}{{b}}`) — both must be parsed, no whitespace required.
4. Variables with whitespace inside braces (`{{  name  }}`) — trimmed.
5. Escaped braces (`\{\{not-a-var\}\}`) — rendered literally.
6. Mismatched braces (`{{name}`, `{name}}`) — `TemplateError code TEMPLATE_UNCLOSED_TAG` at parse time.
7. Duplicate variable references (`{{x}} and {{x}}`) — single key required, both occurrences substituted.
8. Variable name collisions with JS reserved words (`{{class}}`, `{{default}}`) — allowed; we never `eval`.
9. Nested directives mismatched (`{{#if a}}{{#each b}}{{/if}}{{/each}}`) — parser tracks the stack and throws `TEMPLATE_UNCLOSED_TAG`.
10. Unicode variable names (`{{имя}}`, `{{user_id_😀}}`) — accepted; we operate on code-point sequences, not bytes.
11. Very long templates (>1 MB) — supported but parser must remain O(N), no quadratic regex.

### 9.2 Variable substitution
12. `null` / `undefined` values for required vars → `VariableError` (treated as missing).
13. `undefined` for optional `{{name?}}` → renders to empty string.
14. `null` for optional → renders to empty string (unless `strict: true`, then warns).
15. Object values rendered without `escape: 'json'` → `String(obj)` produces `[object Object]`. We surface a warning in dev and document the `escape: 'json'` opt-in.
16. Array values for `{{x:string[]}}` and `{{#each x}}` — joined with comma OR iterated, depending on directive.
17. Numbers, bigints, booleans → `String(v)` (no locale-specific formatting; LLM input is canonical).
18. Functions / Symbols / class instances passed as vars → `VariableError code VARIABLE_TYPE_MISMATCH`.
19. Circular object passed as var → `String()` returns `[object Object]`; `escape: 'json'` throws via `JSON.stringify`. Wrap in `try/catch` and surface as `VariableError`.
20. Strings containing `{{` or `}}` in user data → rendered literally (no second-pass interpretation; prevents prompt injection via template re-evaluation).

### 9.3 Versioning
21. Two prompts with the same `(id, version)` registered — `register()` throws `REGISTRY_DUPLICATE` unless called via `register(def, { replace: true })` (used by hot-reload).
22. Selector `'^0.0.x'` semantics — caret with zero major: only patch range (matches npm convention).
23. Pre-release versions — excluded from `'latest'` by default; `excludePrereleaseFromLatest: false` includes them.
24. Empty registry, `get('x')` → `VersionError code VERSION_NOT_FOUND`.
25. Selector that's syntactically invalid (`'>>=1'`) → `VersionError code VERSION_RANGE_INVALID`.
26. Mixed-case ids (`'Greet'` vs `'greet'`) — case-sensitive (mirrors module identifier semantics).
27. Concurrent `addSource()` and `register()` — registry uses synchronous `Map` operations under the hood; the only async surface is the source's `load()` call. Lost-update protection: each source's emissions are namespaced by source name when the same `(id, version)` arrives from multiple sources, last-write-wins with a warning event.

### 9.4 A/B testing
28. Weights summing to 0 → `AB_TEST_INVALID_WEIGHTS`.
29. Weights summing to >100 → `AB_TEST_INVALID_WEIGHTS`.
30. Weights summing to <100 with no holdout — implicit holdout for the gap. Documented.
31. Single variant with weight 100 — valid; `assign()` always returns it.
32. Duplicate variant ids — `AB_TEST_DUPLICATE_VARIANT`.
33. `identifier()` returns `undefined` — assignment is `'unassigned'`, prompt is `undefined`. Caller decides fallback.
34. `identifier()` throws — caught and wrapped as `'unassigned'` with the original error attached to `assignment.error?`.
35. Different `name`s with overlapping variant ids segment users independently (the `name` is mixed into the hash).
36. Hash collisions across millions of users — bucket distribution remains uniform within ±0.5% on FNV-1a (verified by tests).
37. Reassignment guarantees — same `(name, identifier)` pair always returns the same variant, even after process restart and across machines (no stored state).
38. Holdout > 1 — `AB_TEST_INVALID_WEIGHTS`.
39. Holdout exactly 1 — every user is in holdout (valid, useful for kill-switching the experiment).

### 9.5 Cost
40. Unknown model → `CostError code COST_UNKNOWN_MODEL` with a hint to call `registerModel()`.
41. Model registered with negative price → `COST_INVALID_TOKEN_COUNT` (validated at registration time).
42. Tokenizer returns negative number / NaN / Infinity → `COST_INVALID_TOKEN_COUNT`.
43. Default heuristic tokenizer underestimates by ~10% for Latin text and overestimates by up to 50% for CJK. Documented; advise providing a real tokenizer for production accounting.
44. Composition with multiple roles — sum tokens across all messages plus a per-message overhead constant (configurable per-model in pricing table).
45. Multimodal content (image parts) — heuristic counts the text only; pricing table has an `imageBaseTokens` field for known providers; unknown handling logs a one-time warning.

### 9.6 Sources
46. `httpSource` with non-2xx response → `SourceError code SOURCE_LOAD_FAILED`, retained as a `change` event with `type: 'error'`.
47. `httpSource` with malformed JSON → `SOURCE_PARSE_FAILED`.
48. `httpSource` TTL expiry mid-render — current render uses already-loaded data; refresh happens between renders.
49. `fsSource` glob matching zero files → empty load, no error (allows starting up before prompts exist).
50. `fsSource` watch on a directory that doesn't exist → `SOURCE_LOAD_FAILED`.
51. `fsSource` invoked in an edge runtime (no `node:fs`) → `SOURCE_FS_UNAVAILABLE` thrown at `load()` time, not at module import.
52. `fsSource` watcher fires bursts of events on a single save (Vim's atomic-write pattern) → debounced 50 ms.
53. Source returns a record whose `version` is invalid SemVer → `SOURCE_PARSE_FAILED` for that record only; other records succeed.
54. Two sources export the same `(id, version)` with different bodies → registry keeps the most recent and emits a `'replaced'` event with `previousSource` metadata.

### 9.7 Adapters
55. `toOpenAI` on a `Composition` that contains a `tool` role but no `toolCallId` → `VariableError`.
56. `toAnthropic` on a `Composition` with multiple system blocks — Anthropic only supports a single system; we concatenate with `\n\n` and emit a one-time warning.
57. `toAnthropic` with no system block — `system` field omitted (Anthropic accepts that).
58. `toAISDK` with multimodal parts — preserved; falls back to text-only if the part type is unknown.
59. `toLangChain` with `@langchain/core` not installed — adapter still works at runtime (it produces plain objects matching the `BaseMessage` shape); type-check requires the peer dep.

### 9.8 Tools, structured outputs, prompt caching
65. `tool({ parameters })` with a non-object schema → `TOOL_INVALID_SCHEMA` at call time (the JSON Schema must have `type: 'object'` for OpenAI/Anthropic compatibility).
66. Two `tool()` definitions with the same `name` in the same `compose({ tools })` → `TOOL_INVALID_SCHEMA` (duplicate tool names are a provider error; we surface it earlier).
67. `responseSchema` declared on a composition that also declares `tools` with a forced `tool_choice` — adapters prioritize structured output over forced tool calls and emit a one-time warning.
68. `cacheBreakpoint()` called more than 4 times in a single composition → keep the last 4, emit `CACHE_BREAKPOINT_LIMIT` warning (Anthropic hard limit; OpenAI ignores breakpoint count).
69. `cacheBreakpoint()` on a `Composition` rendered for `toLangChain` — pass-through via `additional_kwargs.providerMetadata`; LangChain core itself does not consume it.
70. `compose({ cache: 'off' })` — adapters strip all `cache_control` markers and `prompt_cache_key` fields, useful for A/B-comparing cache-enabled vs cache-disabled.

### 9.9 Source integrity
71. `httpSource({ verify })` returns `false` → emit `change` event `{ type: 'error', error: SourceError(SOURCE_INTEGRITY_FAILED) }`; the previous successful load remains active.
72. `verifyHmac` with header missing on the response → returns `false`, surfaces as `SOURCE_INTEGRITY_FAILED`.
73. `verifyHmac` with `secret` rotated mid-flight (cluster scenario) — supply an array of secrets and accept if any matches; documented pattern in `verifyHmac` JSDoc.
74. Unsubscribe returned by `addSource()` called twice → second call is a no-op (idempotent), no error.
75. `registry.dispose()` called while a source's `load()` is in flight → awaits the in-flight load, then runs each source's `dispose()` in parallel.

### 9.10 Cost / tokenizer accuracy
76. `tokenizer` returns `0` for non-empty input → still valid (treated as "below resolution"); cost is 0 for that segment.
77. `estimateCost` for a model whose pricing has `cachedInputUSDPer1M` set, called on a composition with `cacheBreakpoint()` — the heuristic does NOT auto-discount (it cannot know the cache hit rate); document that callers pass an explicit `cachedTokens` override (added in v0.2). v0.1 always assumes cold-cache pricing — documented as a known under-precision.
78. `tiktokenFor('unknown-model')` falls back to `cl100k_base` with a one-time `console.warn` and tags the result `tokenizer: 'tiktoken/cl100k_base (fallback)'`.

### 9.11 Type-shape A/B safety
79. `createABTest({ variants: [{ prompt: greetV1 }, { prompt: searchV1 }] })` — `greetV1` and `searchV1` have divergent `TVars` → **compile error** (the array constraint forces a single `TVars` across all variants). This is the headline class of bug the new typing prevents.

### 9.8 Misc
60. Calling builder methods after `.build()` → `BUILDER_FROZEN`.
61. `Object.freeze` of nested partial values is shallow; document that consumers should not mutate nested objects passed to `.partial()`.
62. JSON serialization round-trip preserves all fields, including `metadata` and `tags`. Functions on `validate()` are not serialized (they live on the in-memory builder), so reconstructed prompts from sources have no validator unless the source format includes a referenced one.
63. Render output is a plain string with no BOM, no leading/trailing whitespace stripping (we preserve exactly what the template produces).
64. Concurrent `render()` calls on the same `PromptDefinition` are safe — the AST is read-only and renderers create no shared state.

---

## 10. Out of Scope (explicit)

Pinned here so future contributors don't drift the scope:

- **LLM invocation itself.** Use `ai`, `openai`, `@anthropic-ai/sdk`, or any other client. We only shape the input.
- **RAG / vector search.** Different tool, different lib.
- **Eval / grading models.** That's `promptfoo`; we emit a `toPromptfoo()` helper at most (not v1).
- **Hosted SaaS prompt registry.** Local-first is a feature.
- **UI for editing prompts.** Could be a sibling lib (`@aikit/prompts-ui`); not in this package.
- **Real (BPE) tokenization.** Heuristic ships built-in; real tokenizers (tiktoken, anthropic-tokenizer) plug in via `TokenizerFn`.

---

## 11. Implementation Order (non-binding)

### v0.1 — first publishable cut

1. `internal/parser` (substitution-only) + `core/template` + `core/types` + `errors/*` — the rendering core, fully tested.
2. `types/extract-vars` + `types/input-shape` + `types/test-d.ts` files — type system locked in (including the A/B "all variants share TVars" assertion).
3. `core/prompt` (with `.input<T>()` intersect + `.replaceInput<T>()`) + `core/block` (with `.cacheBreakpoint()`) + `core/tool` + `core/compose` builders.
4. `versioning/semver` + `versioning/registry` + `versioning/selector`. Both `createTypedRegistry` and `createRegistry` shipping together.
5. `testing/hash` + `testing/allocation` + `testing/ab-test` with the `kind`-discriminated `Assignment`.
6. `cost/tokenizer` + `cost/pricing` (with `cachedInputUSDPer1M`) + `cost/estimate`.
7. `sources/memory` (inlined into the universal barrel) + `sources/verify` (`verifyHmac`) + `sources/http` (with `verify` hook) + `sources/fs`.
8. `adapters/openai` + `adapters/anthropic` + `adapters/ai-sdk` + `adapters/langchain` — all generic in `TVars`, all carry tools / responseSchema / cache breakpoints.
9. `template-extras` (`{{#if}}`, `{{#each}}`, `{{> partial}}`) as opt-in subpath.
10. `cost/tiktoken` peer-optional subpath (`tiktokenFor`).
11. README, examples (incl. one demonstrating Anthropic prompt caching end-to-end), benchmarks.
12. CI: `lint → typecheck → test → coverage → build → publint → attw → size`.

### v0.2 milestones (post-launch backlog)

- **`toMCP()` adapter** — emit MCP `prompts/get` envelopes with typed `arguments` derived from `TVars`. Ship against the stabilized 1.x prompt resource shape.
- **Cache-aware cost estimation** — `estimateCost({ cachedTokens })` to model the Anthropic / OpenAI cached-input discount when callers know their cache hit rate.
- **`toPromptfoo()` helper** — emit a `promptfoo` config snippet for an A/B test definition so users can drive eval/regression suites from the same registry.
- **Native Web Crypto Ed25519 verifier** — sibling to `verifyHmac` once Web Crypto Ed25519 support stabilizes across edge runtimes (Cloudflare Workers, Vercel Edge, Bun, Deno).
- **Streaming-aware adapters** — pass-through `experimental_partialOutput` schema and tool-call streaming hints once Vercel AI SDK 4.x stabilizes the shape.

---

## Review Changes

This section records the disposition of every reviewer point from PR #1 (Vasyl Bruhanda, REQUEST_CHANGES). Each entry: the original concern, the resolution, and the PLAN.md / package.json sections that moved.

### Critical

**1. Type information dies on registry retrieval, adapter call, and cost estimation.** *Agreed — this was the headline ship-blocker.* The whole pitch falls apart if the typed prompt becomes `Record<string, unknown>` at the registry boundary.
- **Registry**: added `createTypedRegistry<TMap>(map)` factory that preserves per-id `TVars` end-to-end (`registry.get('greet.user')` is the precise `PromptDefinition<{ name: string; count: number }>`). Kept `createRegistry()` as the loose escape hatch for dynamic / hot-reloaded prompts. Updated §2.3 in full.
- **Adapters**: `toOpenAI`, `toAnthropic`, `toAISDK`, `toLangChain` are now `<TVars>(src: PromptDefinition<TVars> | Composition<TVars>, vars: TVars)`. §2.7 rewritten.
- **Cost**: `estimateCost<TVars>(args: EstimateCostArgs<TVars>)` — `vars` is type-checked against the prompt. §2.5 rewritten.
- **Sections changed**: §2.3, §2.5, §2.7, §1 file-by-file table.

**2. A/B variants don't enforce identical input shape.** *Agreed — the worst class of A/B bug, and it ships green.*
- `createABTest` is now `<TVars, const TVariants extends ReadonlyArray<VariantDefinition<string, TVars>>>(...)` — every variant is constrained to the same `TVars`.
- `VariantDefinition<TId, TVars>` parameterized; `prompt: PromptDefinition<TVars>`.
- `Assignment` now discriminates on `kind: 'variant' | 'holdout' | 'unassigned'` rather than overloading `variant`, so a user-named `'holdout'` variant cannot collapse the union (addresses Vasyl's medium issue #9 in the same change).
- Added edge case 79 in §9.11 calling out that mismatched-`TVars` variants are now a compile error.
- **Sections changed**: §2.4, §9.11.

### High

**3. `process.env.NODE_ENV` and `npm config get loglevel` break Edge runtimes.** *Agreed — Vasyl is right that `npm config` at runtime is nonsense and bare `process.env` throws on Workers.*
- §5.3 rewritten: dropped the `npm config` line entirely; the env check is gated `typeof process !== 'undefined' && typeof process.env !== 'undefined' && process.env.NODE_ENV === 'production'`. Documented "include the link by default" as the safer fallback.
- **Sections changed**: §5.3.

**4. 9 KB minified core budget is aspirational given declared parser surface.** *Agreed.* I took the more conservative path Vasyl offered: move iteration directives out of core *and* clarify min+gz.
- Iteration directives (`{{#if}}`, `{{#each}}`, `{{> partial}}`) moved to a new opt-in `@aikit/prompts/template-extras` subpath. Core parser is now substitution-only (the 80% case).
- All size-limit budgets restated as **min+gz** (matching `@size-limit/preset-small-lib`'s default). Core target lowered to 7 KB min+gz with a 9 KB hard cap; `template-extras` carries 2 KB.
- Added an explicit "Why the budget changed" callout under the §6.1 table.
- **Sections changed**: §0 principle 10, §1 file structure, §1 file-by-file table (`internal/parser`), §6.1, §6.3 tsup entries, package.json `size-limit` (gzip flag set, all entries renamed `(min+gz)`).

**5. No first-class story for prompt caching, tool defs, structured outputs, MCP.** *Agreed — the report itself flags caching as a competitive risk.*
- Added `block().cacheBreakpoint()` chain step. Adapters translate to Anthropic `cache_control: { type: 'ephemeral' }`, OpenAI `prompt_cache_key`, and AI SDK `providerOptions`. Up to 4 breakpoints per composition (Anthropic limit) with `CACHE_BREAKPOINT_LIMIT` warning above that.
- Added `tool({ name, description, parameters })` builder distinct from `block('tool')`. Plain JSON Schema parameters; bring-your-own validation (Zod, Valibot, Effect).
- Added `compose({ tools?, responseSchema?, cache? })` for tool registration and structured outputs (`response_format: { type: 'json_schema' }`).
- Added pricing field `cachedInputUSDPer1M` for caching-aware pricing tables (cache-discount math itself deferred to v0.2 with explicit caveat in §9.10).
- `toMCP()` documented as a v0.2 milestone (waiting on stabilized MCP 1.x prompt resource shape).
- **Sections changed**: §1 (added `core/tool.ts`), §2.2 (block.cacheBreakpoint, tool, compose options, ChatMessage.cacheControl), §2.5 (`cachedInputUSDPer1M`), §2.7 (adapter outputs), §5.1 (new error codes), §9.8 (cache/tool edge cases 65-70), §11 v0.2 milestones, package.json keywords (added `prompt-caching`, `anthropic-prompt-caching`, `tool-use`, `structured-output`, `json-schema`, `mcp`).

### Medium

**6. `.input<T>()` REPLACES inferred shape — silent footgun.** *Agreed.* Changed semantics:
- `.input<TOverride extends Partial<TInput>>()` is now **non-destructive** — the override intersects with the inferred shape, narrowing one or two keys without restating every key.
- Added `.replaceInput<T>()` for the rare destructive case (deep nested objects, dynamic keys).
- **Sections changed**: §2.1, §1 file-by-file table for `core/prompt.ts`.

**7. Heuristic tokenizer too rough to call this "cost tracking".** *Agreed.*
- Renamed marketing in package.json `description` from "per-version cost tracking" to "heuristic per-version cost estimation (with optional tiktoken adapter)". Renamed npm keyword `cost-tracking` → `cost-estimation`.
- Added `estimateTokens()` sibling and exported `roughCost` as an alias of `estimateCost` so callers can pick the name that signals intent at the call site.
- Shipped `@aikit/prompts/cost/tiktoken` subpath with `tiktokenFor(model): TokenizerFn` that lazy-loads `js-tiktoken` (peer-optional, never bundled into core).
- `CostEstimate` and `TokenEstimate` now carry `tokenizer: string` and `accuracy: 'rough' | 'exact'` so consumers can tell at runtime which path they're on.
- §2.5 leads with an explicit "Honesty about the heuristic" callout.
- **Sections changed**: §1 (new `cost/tiktoken.ts`), §2.5, §6.1, §6.3, §9.10 (edge cases 76-78), package.json description/keywords/exports/peerDeps/devDeps/size-limit.

**8. `httpSource` has no integrity verification.** *Agreed — the KV provider itself is in the threat model.*
- Added `verify?: VerifyFn` option to `httpSource`. Returning `false` emits a `'change'` event of `type: 'error'` with `code: SOURCE_INTEGRITY_FAILED` and the previous successful load remains active.
- Shipped a built-in `verifyHmac({ secret, headerName, algorithm?, encoding? })` helper using Web Crypto (`SubtleCrypto`) so it works in every supported runtime.
- Documented multi-secret rotation pattern as edge case 73.
- Native Ed25519 verifier deferred to v0.2 (waiting on Web Crypto Ed25519 stabilization across edge runtimes).
- **Sections changed**: §1 (new `sources/verify.ts`), §2.6, §5.1 (`SOURCE_INTEGRITY_FAILED` code), §9.9 (edge cases 71-75), §11 v0.2.

**9. `assignment.variant` overloads with `'holdout' | 'unassigned'`.** *Agreed.* Subsumed into critical fix #2 — `Assignment` now discriminates on a separate `kind` field. User variant ids can include `'holdout'` without collision.

**10. `validate()` `void` return type footgun.** *Agreed.* Changed signature to `(vars: TInput) => readonly string[]` (empty array means valid). Documented the reasoning in JSDoc — mirrors Zod / Valibot / Effect conventions and makes the contract impossible to forget. **Section changed**: §2.1.

### Low

**11. Async unsubscribe is awkward.** *Agreed.* Changed `subscribe?(listener): () => void` (synchronous unsubscribe) and added optional `dispose?(): Promise<void>` for sources that need async teardown. `registry.addSource()` returns a synchronous unsubscribe; `registry.dispose()` is the async drain. **Sections changed**: §2.3, §2.6.

**12. `sources/memory` at 0.2 KB is over-decomposed.** *Agreed.* Removed the dedicated `./sources/memory` subpath; `memorySource` is now exported from the universal `@aikit/prompts/sources` barrel alongside `verifyHmac`. **Sections changed**: §1, §2.6, §6.1, §6.3, package.json `exports` map.

**13. `PromptBuilder<{}, never, undefined>` exposes ugly internal generics.** *Agreed.* The exported `PromptBuilder<TInput>` is a single-arg user-facing alias. The three internal generics live on a private `_PromptBuilder<TInput, TPartialKeys, TVersion>`. Hovers show resolved input shape via a `Prettify<T>` mapped type. **Sections changed**: §2.1.

### "What's good" notes
No changes needed — the review's positive call-outs (strict layering rules, FNV-1a, `import type`-only adapters, tagged `PromptError` hierarchy, `pricingDate`, edge case 9.20 prompt-injection-via-template-re-evaluation, the `ExtractVariables<T>` template-literal-types approach) are all preserved.

### Summary of files modified
- **PLAN.md**: §0 (principle 10), §1 (file tree + responsibility table), §2.1 (builder), §2.2 (block + tool + compose), §2.3 (registry), §2.4 (A/B), §2.5 (cost), §2.6 (sources), §2.7 (adapters), §5.1 (error codes), §5.3 (edge-safe env check), §6.1 (bundle table + rationale), §6.3 (tsup entries), §9.7 / §9.8 / §9.9 / §9.10 / §9.11 (edge cases 65-79), §11 (v0.1 reorder + v0.2 milestones).
- **package.json**: `description`, `keywords` (added 6, replaced `cost-tracking` → `cost-estimation`), `exports` (added `template-extras`, `cost/tiktoken`; removed `sources/memory`), `peerDependencies` / `peerDependenciesMeta` (added `js-tiktoken`), `devDependencies` (added `js-tiktoken`), `size-limit` (every entry now `gzip: true`, names suffixed `(min+gz)`, core raised to 9 KB hard cap, new `template-extras`/`cost/tiktoken`/`sources` entries, removed `sources/memory`).

