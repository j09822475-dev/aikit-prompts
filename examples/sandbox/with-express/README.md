# Express + filesystem hot-reload — `@aikit/prompts`

The Node-side workflow: prompts live in a directory of `*.json` files
(so PMs and ML engineers can edit them without a redeploy), `fsSource`
watches the directory, and the registry serves the latest version
matching a SemVer range. Anthropic's request shape comes out of
`toAnthropic(...)` — including `cache_control: { type: 'ephemeral' }`
breakpoints on the static system block.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/j09822475-dev/aikit-prompts/tree/main/examples/sandbox/with-express)

## What it shows

- `fsSource({ glob, watch: true })` — Node-only source that lazy-imports
  `node:fs/promises`. Picks up new `*.json` files via `node:fs.watch`
  with debounce.
- `createRegistry().addSource(...)` + `registry.on('change', ...)` —
  hot-reload pipeline. The example writes a v1.1.0 file mid-run and
  watches the registry pick it up.
- `block(...).cacheBreakpoint()` + `compose([system, user])` — assemble
  a chat-style template with a static prefix flagged for caching.
- `toAnthropic(composition, vars)` — emits Anthropic's
  `messages.create(...)` shape with cache-control on the right blocks.

The Anthropic client is replaced with a stub that returns the request
shape, so the example runs end-to-end without an API key.

## Run locally

```bash
npm install
npm start
```

Expected output:

```
--- initial request (v1.0.0) ---
  initial: { ..., promptVersion: '1.0.0' }

--- writing v1.1.0 to disk ---
--- after hot-reload (^1.0.0 picks 1.1.0) ---
  reloaded: { ..., promptVersion: '1.1.0' }
```

See [`index.ts`](./index.ts) for the full app.
