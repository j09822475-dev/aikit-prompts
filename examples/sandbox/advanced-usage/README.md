# Advanced usage — `@aikit/prompts`

A realistic production scenario for a code-review assistant: composed
chat-style prompts (system + few-shot + user), tools, structured output,
prompt-cache breakpoints, two prompt versions in a typed registry, a
deterministic A/B split between them, per-version cost estimation, and
both OpenAI- and Anthropic-shaped output payloads.

No SDK calls, no API keys — every external boundary is pure data shaping.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/j09822475-dev/aikit-prompts/tree/main/examples/sandbox/advanced-usage)

## What it shows

- `block(role)` + `compose([...])` — assemble system, few-shot examples,
  and a typed user turn into a single `Composition`.
- `tool({ ... })` and `responseSchema` — first-class tool/structured-output
  declarations that flow through every adapter.
- `cacheBreakpoint()` — a static system block that translates to
  Anthropic `cache_control: { type: 'ephemeral' }` and an OpenAI
  `prompt_cache_key` so the static prefix is reused across requests.
- `createTypedRegistry({ ... })` — two versions of the same prompt id
  resolved by `latest`, exact, `^1.0.0`, and `~2.0.0` selectors.
- `createABTest({ ... })` — 70/30 split with a 5% holdout, deterministic
  in `userId`. The same id always lands on the same variant — sticky
  without any shared store.
- `estimateCost({ ... })` — per-version dollar/token cost estimates for
  `gpt-4o`. The default heuristic is fine for ranking versions; swap in
  `tiktokenFor(model)` from `@aikit/prompts/cost/tiktoken` when you need
  billing-grade accuracy.
- `toOpenAI(...)` / `toAnthropic(...)` — provider-specific shapes
  emitted from the same composition.

## Run locally

```bash
npm install
npm start
```

See [`index.ts`](./index.ts) for the full walkthrough.
