# Hono on the edge (Cloudflare Workers / Bun / Deno) — `@aikit/prompts`

A Hono app exposes `/summarize` (Vercel AI SDK + `toAISDK`) and
`/classify` (deterministic A/B split between two prompt versions). The
language model is replaced with a stub that echoes the prompt, so the
example runs end-to-end without an API key.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/j09822475-dev/aikit-prompts/tree/main/examples/sandbox/with-hono)

## What it shows

- `toAISDK(prompt, vars)` — output shape that drops straight into
  `generateText({ model, ...args })` from the `ai` package.
- `createABTest({ ... })` — deterministic 50/50 split keyed on
  `userId`. Same user, same variant, no shared store, no network call;
  edge-runtime safe.
- `app.request(...)` — Hono's built-in dispatcher means the example can
  hit its own routes without spinning up a server, perfect for a quick
  StackBlitz demo.

## Run locally

```bash
npm install
npm start
```

Expected output (last block):

```
--- POST /classify (5 different users) ---
alice  → treatment  (v1.1.0)
bob    → control    (v1.0.0)
carol  → treatment  (v1.1.0)
dave   → control    (v1.0.0)
eve    → control    (v1.0.0)
```

## Deploy to Cloudflare Workers

`@aikit/prompts` core, `httpSource`, and `verifyHmac` are all edge-safe
(no Node imports). Run `wrangler deploy` against this app and the same
code runs unchanged.
