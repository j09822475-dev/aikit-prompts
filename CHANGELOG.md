# Changelog

All notable changes to `@aikit/prompts` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-02

Initial public release. Lightweight, zero-dep, type-safe LLM prompt management for TypeScript.

### Added

- **Core builders** (`@aikit/prompts`):
  - `prompt(id)` — chainable builder with `.version()`, `.template()`, `.input<T>()` (non-destructive intersect), `.replaceInput<T>()` (destructive), `.partial()`, `.metadata()`, `.tags()`, `.validate()`, `.build()`. Frozen `PromptDefinition` after `.build()`.
  - `block(role)` — message block builder with `.template()`, `.examples()`, `.partial()`, `.cacheBreakpoint()`, `.build()`.
  - `tool({ name, description, parameters })` — JSON Schema-based tool / function definition.
  - `compose(blocks, options?)` — combines blocks into a `Composition` with `tools`, `responseSchema`, `cache` mode.
  - `compileTemplate(source)` / `extract(source)` — static analysis helpers.
  - `fromJSON(json)` — reconstruct a `PromptDefinition` from its serialized form.
- **Template engine**:
  - `{{name}}`, `{{name?}}`, `{{name:number}}`, `{{name:string[]}}`, `{{!-- comment --}}` substitution syntax.
  - Compile-time variable extraction via TypeScript template-literal types — no codegen.
  - Render options: `escape: 'none' | 'markdown' | 'json'`, `strict: boolean`.
  - Opt-in iteration directives at `@aikit/prompts/template-extras`: `withIfEach()` (`{{#if x}}…{{/if}}`, `{{#each items}}…{{/each}}`) and `withPartials()` (`{{> name}}` with `registerPartial`/`unregisterPartial`).
- **Versioning** (`@aikit/prompts/versioning`):
  - `createTypedRegistry(map, options?)` — typed registry; lookups return the precise `PromptDefinition<TVars>` for the registered id; unknown ids fail to compile.
  - `createRegistry(options?)` — loose-typed dynamic registry with `addSource(...)`, `on('change', ...)`, `dispose()`.
  - SemVer parser/comparator/range matcher: exact, `^`, `~`, `>=`, `<=`, `>`, `<`, `=`, `x`/`*` wildcards.
  - `excludePrereleaseFromLatest` (default `true`).
- **A/B testing** (`@aikit/prompts/testing`):
  - `createABTest({ name, variants, identifier, holdout?, hash? })` — deterministic FNV-1a hashing; same identifier → same variant; edge-runtime safe; no network round-trip.
  - All variants in a test must share the same `TVars` — enforced at the type level.
  - `Assignment` discriminated on `kind` (`'variant' | 'holdout' | 'unassigned'`), not on `id`.
  - Helpers: `stickyUserOrSession`, `identifierFromKey(key)`, `fnv1a32`, `bucketize`.
- **Cost estimation** (`@aikit/prompts/cost`):
  - `estimateCost({ prompt, vars, model, expectedOutputTokens?, tokenizer? })` — generic in `TVars`; returns `{ inputTokens, outputTokens, inputCostUSD, outputCostUSD, totalUSD, currency, model, pricingDate, tokenizer, accuracy }`.
  - `estimateTokens(...)` — tokens-only counterpart.
  - `roughCost` — alias of `estimateCost` for explicit "rough" call sites.
  - `registerModel(model, pricing)`, `unregisterModel(model)`, `listModels()`, `getPricing(model)`.
  - Built-in pricing snapshot (April 2026) for OpenAI (`gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1`, `o1-mini`), Anthropic (`claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest`, `claude-3-opus-latest`), and Google (`gemini-1.5-pro`, `gemini-1.5-flash`).
  - Default heuristic tokenizer `Math.ceil(text.length / 4)` (`accuracy: 'rough'`).
  - Opt-in `@aikit/prompts/cost/tiktoken` subpath: `tiktokenFor(model)` returns a `TokenizerFn` backed by `js-tiktoken` (peer-optional, never bundled into core). Unknown models fall back to `cl100k_base` with a one-time warning.
- **Sources & hot-reload**:
  - `@aikit/prompts/sources` — `memorySource(records)` (synchronous fixture), `verifyHmac(options)` (Web Crypto HMAC verifier; SHA-256/384/512; hex/base64/base64url; universal across edge runtimes).
  - `@aikit/prompts/sources/http` — `httpSource({ url, fetch?, headers?, ttlMs?, pollMs?, parser?, verify?, name? })`. Polling adds 0–10% jitter; failures double the delay (capped at `pollMs * 2^30`); polling stops when no listener remains.
  - `@aikit/prompts/sources/fs` — `fsSource({ glob, watch?, parser?, name?, debounceMs? })`. Lazy-imports `node:fs/promises` and `node:path` so edge bundlers never pull Node modules unless the subpath is statically imported.
  - Strict JSON parser rejects unknown fields and validates `id` / `template` / `version` (SemVer) / `partial` / `metadata` / `tags`.
- **Provider adapters**:
  - `@aikit/prompts/adapters/openai` — `toOpenAI(src, vars)` → `{ messages, tools?, response_format?, prompt_cache_key? }`. `prompt_cache_key` derived from a hash of the cache prefix.
  - `@aikit/prompts/adapters/anthropic` — `toAnthropic(src, vars)` → `{ system?, messages, tools? }`. `cacheBreakpoint()` translates to per-block `cache_control: { type: 'ephemeral' }`. Multiple `system` blocks concatenate with a one-time warning.
  - `@aikit/prompts/adapters/ai-sdk` — `toAISDK(src, vars)` → `{ messages, tools?, experimental_output?, providerOptions? }`. Cache hints flow through `providerOptions.{anthropic,openai}`.
  - `@aikit/prompts/adapters/langchain` — `toLangChain(src, vars)` → `readonly LangChainMessage[]`. Structural compat layer; no `@langchain/core` import at runtime.
- **Errors**:
  - `PromptError` abstract root + `ErrorCode` literal union (`'INVARIANT'`, `'TEMPLATE_PARSE'`, `'TEMPLATE_UNCLOSED_TAG'`, `'TEMPLATE_UNKNOWN_DIRECTIVE'`, `'VARIABLE_MISSING'`, `'VARIABLE_TYPE_MISMATCH'`, `'VARIABLE_VALIDATION_FAILED'`, `'VERSION_INVALID'`, `'VERSION_NOT_FOUND'`, `'VERSION_RANGE_INVALID'`, `'AB_TEST_INVALID_WEIGHTS'`, `'AB_TEST_DUPLICATE_VARIANT'`, `'AB_TEST_NO_IDENTIFIER'`, `'COST_UNKNOWN_MODEL'`, `'COST_INVALID_TOKEN_COUNT'`, `'SOURCE_LOAD_FAILED'`, `'SOURCE_PARSE_FAILED'`, `'SOURCE_FS_UNAVAILABLE'`, `'SOURCE_INTEGRITY_FAILED'`, `'REGISTRY_DUPLICATE'`, `'BUILDER_FROZEN'`, `'TOOL_INVALID_SCHEMA'`, `'CACHE_BREAKPOINT_LIMIT'`).
  - Concrete subclasses with structured context: `TemplateError`, `VariableError`, `VersionError`, `ABTestError`, `CostError`, `SourceError`, `RegistryDuplicateError`, `BuilderFrozenError`, `ToolSchemaError`, `CacheBreakpointLimitError`, `InvariantError`.
  - Edge-safe production check (no bare `process.env` reads); docs links suppressed in production.
  - `tryRender()` mirrors of `render()` returning `Result<string, VariableError>` for boundary code.
- **Result helper** — `Result<T, E>`, `ok`, `err`, `isOk`, `isErr`.
- **Bundle discipline** — core ≤ 9 KB min+gz hard cap, with per-subpath budgets enforced via `size-limit` in CI.
- **Runtime targets** — Node 18+, Bun, Deno, browsers, Vercel Edge Runtime, Cloudflare Workers.
- **Strict TypeScript** — `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`.

[0.1.0]: https://github.com/j09822475-dev/aikit-prompts/releases/tag/v0.1.0
