# Next.js (App Router, Edge Runtime) — `@aikit/prompts`

A standard `Request → Response` POST handler — the exact shape Next.js's
`app/api/.../route.ts` exports under `export const runtime = 'edge'`.
Hot-reloads prompts from a signed HTTPS endpoint, resolves by SemVer
range, and shapes the request via the OpenAI adapter.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/j09822475-dev/aikit-prompts/tree/main/examples/sandbox/with-nextjs)

## What it shows

- `httpSource({ url, fetch, verify: verifyHmac(...) })` — pull prompts
  from a signed HTTPS endpoint at startup. The `verify` hook is
  `verifyHmac` from `@aikit/prompts/sources` — a Web-Crypto-backed
  HMAC-SHA-256 verifier that runs unchanged on Vercel Edge and
  Cloudflare Workers.
- `createRegistry().addSource(...)` — non-blocking ingestion;
  `registry.on('change', ...)` fires when the first batch lands.
- `registry.get('answer.qa', '^1.0.0')` — resolve a SemVer range against
  whatever versions the source delivered.
- `toOpenAI(def, vars)` — type-checked request shape suitable for
  `chat.completions.create({ model, ...params })`.

The handler is invoked directly with a synthetic `Request`, so the
example runs end-to-end without the Next.js runtime, an OpenAI key, or
real network I/O — `fetch` and the OpenAI client are stubbed.

## Run locally

```bash
npm install
npm start
```

See [`index.ts`](./index.ts) for the full handler.

## Drop into a Next.js app

Move the handler into `app/api/answer/route.ts` and replace `stubOpenAI`
with the real OpenAI client:

```ts
const completion = await new OpenAI().chat.completions.create({
  model: 'gpt-4o',
  ...params,
});
```

`fsSource` is Node-only; do not import it from an edge route.
