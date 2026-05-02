# Basic usage — `@aikit/prompts`

Minimum surface area for getting value out of the library: define a typed,
versioned prompt template, render it, partially apply it, and recover from
missing variables with a typed `Result` instead of an exception.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/j09822475-dev/aikit-prompts/tree/main/examples/sandbox/basic-usage)

## What it shows

- `prompt(id).version(...).template(...).build()` — the canonical builder chain.
- `render` vs. `tryRender` — throw vs. typed `Result<string, VariableError>`.
- `.partial(...)` — pre-fill some variables and tighten the required-keys check.
- `.toJSON()` — serialize a built prompt for storage / hot-reload.

## Run locally

```bash
npm install
npm start
```

Expected output:

```
--- render ---
Hello Alice, you have 3 new messages.

--- variables() ---
[ 'name', 'count' ]

...

--- tryRender on missing var ---
error.code   : VARIABLE_MISSING
error.missing: [ 'count' ]
```

See [`index.ts`](./index.ts) for the complete walkthrough.
