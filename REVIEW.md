# Review Response — PR #1, Round 2 (Vasyl Bruhanda)

Numbered log of every concern raised in the review and its disposition.

## 1. [HIGH] `tiktokenFor()` returns a tokenizer that throws on first sync call

**Concern:** `src/cost/tiktoken.ts:67-160` — the README/PLAN §2.5 example calls
`tiktokenFor('gpt-4o')` and passes it directly to `estimateCost({ tokenizer })`,
but the returned tokenizer threw `COST_UNKNOWN_MODEL` on first invocation
because the encoder was loaded lazily via `import('js-tiktoken')` and required
`await tokenizer.ready()` first.

**Disposition:** Agree. Fixed via Vasyl's option (b): switched to a static
`import { encodingForModel, getEncoding } from 'js-tiktoken'`. `js-tiktoken` is
sync, declared as a peer dep, and `cost/tiktoken` is its own bundler entry —
the static import does not pull `js-tiktoken` into core because tsup externals
keep it out. The returned `TokenizerFn` is now safe to call synchronously, and
the `.ready()` workaround is gone.

**Files changed:** `src/cost/tiktoken.ts` (rewritten — static import, eager
encoder resolution, fallback path preserved, no `as any`).

## 2. [HIGH] `Buffer` reference inside the universal `sources` barrel

**Concern:** `src/sources/verify.ts:22-24` — `Buffer.from(normalized, 'base64')`
fallback violated PLAN §0 principle 9 (no `Buffer` in core or universal
`sources` barrel). Static reference shows up in the bundle even when unreached.

**Disposition:** Agree. Dropped the fallback entirely — `atob` is universal in
all targets (Node 18+, Bun, Deno, browsers, Vercel Edge, Cloudflare Workers)
so the fallback was dead code.

**Files changed:** `src/sources/verify.ts` (removed `Buffer` branch in
`fromBase64`).

## 3. [HIGH] User-supplied callbacks not caught and rewrapped (PLAN §5.2)

**Concern:** `src/core/prompt.ts:259-269` and `src/cost/estimate.ts:64` —
`validator(merged)` and `tokenizer(text, model)` calls were unguarded. PLAN
§5.2 requires user-supplied callbacks to be caught and rethrown as the
appropriate domain error (`VariableError` / `CostError`) with `cause` set.

**Disposition:** Agree. Wrapped both call sites:
- `validator()` throw → `VariableError('VARIABLE_VALIDATION_FAILED', …,
  { templateId, cause })`.
- `tokenizer()` throw → `CostError('COST_INVALID_TOKEN_COUNT', …,
  { model, cause })`.

`CostError` did not previously declare `cause` in its `details`, so its
constructor was extended (see #13) and the existing `as any` workaround was
removed.

**Files changed:** `src/core/prompt.ts`, `src/cost/estimate.ts`,
`src/errors/cost-error.ts`.

## 4. [HIGH] `toAISDK()` renders the composition twice

**Concern:** `src/adapters/ai-sdk/index.ts:89,115` — `src.render(vars)` was
called once for the message map and again inside the cache-control check.
Doubles the render cost on a hot path.

**Disposition:** Agree. Render once, walk the rendered array in a single pass
to compute both the converted message list and a `hasCache` boolean.

**Files changed:** `src/adapters/ai-sdk/index.ts`.

## 5. [MEDIUM] `template-extras` activation contract drifted from PLAN

**Concern:** `src/template-extras/index.ts:19` — PLAN §1 file-by-file table
said "importing this subpath augments the parser at registration time", but the
implementation requires explicit `withIfEach()` / `withPartials()` calls.

**Disposition:** Aligned the PLAN with the implementation rather than the other
way around. Side-effect-free imports preserve `sideEffects: false` (PLAN §6.2)
and tree-shaking guarantees, which matters more than the convenience of
auto-registration. Updated PLAN §1 entry to describe the activator-function
contract and explain why it is side-effect-free.

**Files changed:** `PLAN.md` (§1 file-by-file table entry for
`src/template-extras/index.ts`).

## 6. [MEDIUM] `toOpenAI` silently emits `tool` messages with undefined `tool_call_id`

**Concern:** PLAN §9.7 #55 requires `toOpenAI` to throw a `VariableError` when a
`tool`-role message is missing `toolCallId`. The Anthropic adapter enforces
this but OpenAI's `toMessage` did not.

**Disposition:** Agree. Added the same guard inside `toMessage`. Threw error
mirrors the Anthropic version (`VARIABLE_TYPE_MISMATCH`,
`"OpenAI adapter requires every 'tool' role message to have a 'toolCallId'"`).
JSDoc updated to advertise the throw.

**Files changed:** `src/adapters/openai/index.ts`.

## 7. [MEDIUM] `httpSource` `pollMs` / `name` undocumented in PLAN; polling has no jitter or backoff

**Concern:** `src/sources/http.ts:35-37,165-181` — `pollMs` and `name` were
introduced beyond PLAN §2.6's `HttpSourceOptions`. `setInterval` ran at full
rate against flapping endpoints — no jitter, no backoff.

**Disposition:** Agree. Two changes:
1. **PLAN updated** — added `pollMs` and `name` to `HttpSourceOptions` in PLAN
   §2.6, with semantics for jitter and backoff.
2. **Polling rewritten** — replaced `setInterval` with a self-rescheduling
   `setTimeout` chain. Each tick adds 0–10% jitter on top of the base delay.
   Consecutive failures double the next delay (capped at `pollMs * 2^30`)
   until a success resets the failure counter. Polling stops when no listener
   remains and resumes on the next `subscribe()`.

**Files changed:** `src/sources/http.ts`, `PLAN.md` (§2.6
`HttpSourceOptions`).

## 8. [MEDIUM] `deepEqual` was dead code; sources used double `JSON.stringify`

**Concern:** `src/internal/deep-equal.ts` was claimed in PLAN §1 to back
"registry dedupe" and "sources for diffing" but had zero importers; the
sources used `JSON.stringify(old) !== JSON.stringify(r)` for diffs.

**Disposition:** Agree. Wired `deepEqual` into both `http.ts` and `fs.ts`
`diffAndEmit` helpers — faster than double-`JSON.stringify` for non-trivial
records and matches the PLAN claim.

**Files changed:** `src/sources/http.ts`, `src/sources/fs.ts`.

## 9. [MEDIUM] `compose.ts` breakpoint accounting hides mutation in an IIFE; duplicated

**Concern:** `src/core/compose.ts:208-214` — counter mutations sat inside an
IIFE used as a boolean expression; the empty-template branch (lines 221-229)
duplicated the same logic in a slightly different shape. Also the
post-loop `breakpointsEmitted > LIMIT` check was dead because `breakpointsToHonor` is `Math.min(totalBreakpoints, 4)`.

**Disposition:** Agree. Extracted `shouldHonor(block, cache, counters)` that
takes a `BreakpointCounters` record and returns a plain boolean. Both the
template-block branch and the empty-template branch now call it. Removed the
dead `breakpointsEmitted > LIMIT` post-loop check (the warning at the top of
`compose()` already fires when `cacheBlocks.length > LIMIT`, which is the only
condition under which the cap matters).

**Files changed:** `src/core/compose.ts`.

## 10. [MEDIUM] `fnv1a32` JSDoc said "UTF-8 string" but reads UTF-16 code units

**Concern:** `src/internal/hash.ts:11` — the doc claimed UTF-8 but the
implementation uses `charCodeAt`, i.e. UTF-16 code units. Hash is stable
in-process but diverges from a "real" UTF-8 FNV-1a for non-ASCII inputs.

**Disposition:** Agree on the doc fix. Updated the JSDoc to state the function
hashes JS string code units (UTF-16), not UTF-8 bytes, and explained why this
is fine for the in-process A/B bucketing and dedup paths the library uses.

**Files changed:** `src/internal/hash.ts` (JSDoc only).

## 11. [LOW] Mixed `as never` / `as any` in `prompt.ts` builder methods

**Concern:** `src/core/prompt.ts:215,221,229` — `metadata`, `tags`, `validate`
returned `builder as never` while sibling methods returned `builder as any`.
`as never` was inaccurate (the function returns `this`, not `never`).

**Disposition:** Agree. The methods declared with return type `this` accept a
plain `return builder` once the closure variable's type is unified — TypeScript
treats the structural shape as compatible. Removed the casts entirely on
`metadata`, `tags`, `validate`. Sibling methods that legitimately narrow the
return type (`version`, `template`, `input`, `replaceInput`, `partial`) keep
their `as any` casts because they expose a narrowed-generic return that the
implementation cannot satisfy without a cast.

**Files changed:** `src/core/prompt.ts`.

Verified with `tsc --noEmit` (clean).

## 12. [LOW] `as any` cast hides missing `cause` field on `CostError`

**Concern:** `src/cost/tiktoken.ts:38-40` — `CostError`'s `details` did not
declare `cause`, so an `as any` papered over the missing field.

**Disposition:** Agree. Added `cause?: unknown` to `CostError`'s `details` and
wired it through to the `Error` superclass constructor's `{ cause }` option
(which `PromptError` already accepts). Now `CostError` matches `VariableError`
and `SourceError` for cause forwarding. Both new wrap sites in #3 use it.

**Files changed:** `src/errors/cost-error.ts`.

## 13. [LOW] `Composition.blocks` / `tools` use the default-generic `Block` / `Tool`

**Concern:** `src/core/types.ts:140-141` — `readonly blocks: readonly Block[];`
discards the per-block `TVars` already inferred at compose time. Less typed
than it could be.

**Disposition:** **Declined for this round.** Vasyl flagged this as low
priority and noted the fix "propagates a heterogeneous-tuple change through
the whole adapter layer." The composition envelope already preserves `TVars`
on `.render()` / `.tryRender()`, which is what user code relies on; the
introspection surface (`composition.blocks`) is rarely walked by user code.
Tracking as a v0.2 follow-up so the adapter-layer impact is sized
deliberately.
