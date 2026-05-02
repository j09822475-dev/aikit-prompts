/**
 * @aikit/prompts — Next.js (App Router, Edge Runtime) integration.
 *
 * Walks through how a production Next.js Edge route would assemble a
 * request to OpenAI: hot-reload prompts from a signed HTTPS endpoint,
 * resolve by SemVer range, and shape the request via the OpenAI adapter.
 *
 * The route handler below is a standard `Request → Response` function,
 * the same shape Next.js's `app/api/.../route.ts` exports. We invoke it
 * directly with a synthetic `Request` so this example runs end-to-end
 * without the Next.js runtime, an OpenAI key, or a real network round-
 * trip — every external boundary is mocked at the edge.
 *
 * Run: npx tsx examples/with-nextjs.ts
 */

import { fromJSON, prompt } from '@aikit/prompts';
import { toOpenAI } from '@aikit/prompts/adapters/openai';
import { verifyHmac } from '@aikit/prompts/sources';
import { httpSource } from '@aikit/prompts/sources/http';
import { createRegistry } from '@aikit/prompts/versioning';

// ── Bootstrap a registry hot-reloaded from a signed HTTPS endpoint ─────────

const SIGNING_SECRET = 'shared-secret-from-env';

// In production the source-of-truth is a CDN/KV bucket of prompt JSON
// signed with HMAC-SHA-256. Here we stub `fetch` so the example is fully
// hermetic — same wire shape, no network call.
const stubFetch = (async () => {
  const records = [
    prompt('answer.qa')
      .version('1.0.0')
      .template('You are {{persona}}. Answer concisely: {{question}}')
      .build()
      .toJSON(),
    prompt('answer.qa')
      .version('1.1.0')
      .template(
        'You are {{persona}}. Answer the question concisely (≤ 80 words): {{question}}',
      )
      .build()
      .toJSON(),
  ];
  const body = JSON.stringify(records);

  // Sign the body with the same secret the verifier uses.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const sigHex = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return async () =>
    new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-prompt-signature': sigHex,
      },
    });
})();

const registry = createRegistry();
registry.addSource(
  httpSource({
    url: 'https://prompts.example.com/answer.json',
    fetch: await stubFetch,
    verify: verifyHmac({
      secret: SIGNING_SECRET,
      headerName: 'x-prompt-signature',
      algorithm: 'SHA-256',
    }),
  }),
);

// Wait for the source to pull at least once.
await new Promise<void>((resolve, reject) => {
  const off = registry.on('change', (e) => {
    if (e.type === 'added' || e.type === 'replaced') {
      off();
      resolve();
    } else if (e.type === 'error') {
      off();
      reject(e.error);
    }
  });
});

// ── The route handler — pure `Request → Response` (App Router shape) ───────

export const runtime = 'edge';

const stubOpenAI = async (params: ReturnType<typeof toOpenAI>) =>
  ({
    id: 'chatcmpl-stub',
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content:
            `(stubbed) ${params.messages.length}-turn request, cache key=${params.prompt_cache_key ?? 'n/a'}`,
        },
        finish_reason: 'stop',
      },
    ],
  }) as const;

export async function POST(req: Request): Promise<Response> {
  const { question, persona } = (await req.json()) as {
    question: string;
    persona: string;
  };

  const def = registry.get('answer.qa', '^1.0.0');
  const typed = fromJSON(def.toJSON()) as ReturnType<typeof fromJSON> & {
    render: (vars: { question: string; persona: string }) => string;
  };
  const params = toOpenAI(typed, { question, persona });

  // Replace `stubOpenAI` with `new OpenAI().chat.completions.create({...})`.
  const completion = await stubOpenAI({ ...params, model: 'gpt-4o' });
  return Response.json(completion.choices[0]?.message);
}

// ── Demo: invoke the route handler directly ────────────────────────────────

const req = new Request('https://app.example.com/api/answer', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    persona: 'a senior staff engineer',
    question: 'When should I prefer a tagged union over a class hierarchy?',
  }),
});

const res = await POST(req);
console.log('--- response ---');
console.log('status:', res.status);
console.log('body  :', await res.json());

console.log('\n--- registry state ---');
console.log('versions of answer.qa:', registry.list('answer.qa').map((p) => p.version));
console.log('resolved (^1.0.0)    :', registry.get('answer.qa', '^1.0.0').version);

await registry.dispose();
