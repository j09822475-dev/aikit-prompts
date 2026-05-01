import type { VerifyFn } from './types.js';

const fromHex = (input: string): Uint8Array => {
  const clean = input.replace(/^0x/, '');
  if (clean.length % 2 !== 0) throw new Error('odd-length hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const high = parseInt(clean[i * 2] ?? '', 16);
    const low = parseInt(clean[i * 2 + 1] ?? '', 16);
    if (Number.isNaN(high) || Number.isNaN(low)) throw new Error('bad hex');
    out[i] = (high << 4) | low;
  }
  return out;
};

const fromBase64 = (input: string, urlSafe: boolean): Uint8Array => {
  let normalized = urlSafe
    ? input.replace(/-/g, '+').replace(/_/g, '/')
    : input;
  while (normalized.length % 4 !== 0) normalized += '=';
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
};

const importKey = async (
  secret: string | ArrayBuffer | CryptoKey,
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512',
): Promise<CryptoKey> => {
  if (secret instanceof CryptoKey) return secret;
  const raw =
    typeof secret === 'string'
      ? new TextEncoder().encode(secret)
      : new Uint8Array(secret);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
};

/** Options accepted by `verifyHmac`. */
export interface VerifyHmacOptions {
  /** Shared HMAC secret. May be a string, raw key bytes, or a pre-imported `CryptoKey`. */
  readonly secret: string | ArrayBuffer | CryptoKey;
  /** HTTP header name carrying the signature. */
  readonly headerName: string;
  /** Hash algorithm. Default `'SHA-256'`. */
  readonly algorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512';
  /** Signature encoding. Default `'hex'`. */
  readonly encoding?: 'hex' | 'base64' | 'base64url';
}

/**
 * Build a `VerifyFn` that authenticates the response body via HMAC.
 *
 * Uses Web Crypto (`crypto.subtle`) so it works in Node 18+, Bun, Deno,
 * browsers, Vercel Edge, and Cloudflare Workers without pulling
 * `node:crypto`.
 *
 * To rotate secrets without downtime, build two `VerifyFn`s with
 * different secrets and compose them: return `true` if either passes.
 *
 * @param options.secret     Shared HMAC secret.
 * @param options.headerName HTTP header name carrying the signature.
 * @param options.algorithm  Hash algorithm. Default `'SHA-256'`.
 * @param options.encoding   Signature encoding. Default `'hex'`.
 * @returns A `VerifyFn` suitable for `httpSource({ verify })`.
 *
 * @example
 * httpSource({
 *   url: '...',
 *   verify: verifyHmac({
 *     secret: env.PROMPT_SIGNING_SECRET,
 *     headerName: 'x-prompt-signature',
 *   }),
 * });
 */
export function verifyHmac(options: VerifyHmacOptions): VerifyFn {
  const algorithm = options.algorithm ?? 'SHA-256';
  const encoding = options.encoding ?? 'hex';
  const keyPromise = importKey(options.secret, algorithm);

  return async (body: string, response: Response): Promise<boolean> => {
    const headerValue = response.headers.get(options.headerName);
    if (!headerValue) return false;

    let expected: Uint8Array;
    try {
      switch (encoding) {
        case 'hex':
          expected = fromHex(headerValue);
          break;
        case 'base64':
          expected = fromBase64(headerValue, false);
          break;
        case 'base64url':
          expected = fromBase64(headerValue, true);
          break;
      }
    } catch {
      return false;
    }

    const key = await keyPromise;
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(body),
    );
    return constantTimeEqual(new Uint8Array(signature), expected);
  };
}

