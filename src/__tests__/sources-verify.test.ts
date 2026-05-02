import { describe, expect, it } from 'vitest';
import { verifyHmac } from '../sources/verify.js';

const computeHmac = async (
  secret: string,
  body: string,
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256',
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const responseWithHeader = (header: string, value: string): Response =>
  new Response('', { headers: { [header]: value } });

describe('verifyHmac', () => {
  it('should return true for a valid SHA-256 hex signature', async () => {
    const body = '{"hello":"world"}';
    const sig = await computeHmac('secret123', body);
    const verify = verifyHmac({
      secret: 'secret123',
      headerName: 'x-sig',
    });
    const ok = await verify(body, responseWithHeader('x-sig', sig));
    expect(ok).toBe(true);
  });

  it('should return false when signature does not match the body', async () => {
    const verify = verifyHmac({
      secret: 'secret123',
      headerName: 'x-sig',
    });
    const ok = await verify(
      '{"hello":"world"}',
      responseWithHeader('x-sig', 'deadbeef'),
    );
    expect(ok).toBe(false);
  });

  it('should return false when the signature header is missing', async () => {
    const verify = verifyHmac({
      secret: 'secret123',
      headerName: 'x-sig',
    });
    const ok = await verify('{}', new Response('', {}));
    expect(ok).toBe(false);
  });

  it('should return false when the header value is malformed hex', async () => {
    const verify = verifyHmac({
      secret: 'secret123',
      headerName: 'x-sig',
    });
    const ok = await verify('{}', responseWithHeader('x-sig', 'zzz'));
    expect(ok).toBe(false);
  });

  it('should support base64 encoding when configured', async () => {
    const body = '{}';
    const sig = await computeHmac('secret123', body);
    const sigBytes = new Uint8Array(
      sig.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
    );
    const sigB64 = btoa(String.fromCharCode(...sigBytes));
    const verify = verifyHmac({
      secret: 'secret123',
      headerName: 'x-sig',
      encoding: 'base64',
    });
    const ok = await verify(body, responseWithHeader('x-sig', sigB64));
    expect(ok).toBe(true);
  });

  it('should support base64url encoding when configured', async () => {
    const body = '{}';
    const sig = await computeHmac('secret123', body);
    const sigBytes = new Uint8Array(
      sig.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
    );
    const sigB64 = btoa(String.fromCharCode(...sigBytes));
    const sigB64Url = sigB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const verify = verifyHmac({
      secret: 'secret123',
      headerName: 'x-sig',
      encoding: 'base64url',
    });
    const ok = await verify(body, responseWithHeader('x-sig', sigB64Url));
    expect(ok).toBe(true);
  });

  it('should support SHA-384 and SHA-512 algorithms', async () => {
    const body = '{}';
    for (const algo of ['SHA-384', 'SHA-512'] as const) {
      const sig = await computeHmac('secret123', body, algo);
      const verify = verifyHmac({
        secret: 'secret123',
        headerName: 'x-sig',
        algorithm: algo,
      });
      const ok = await verify(body, responseWithHeader('x-sig', sig));
      expect(ok).toBe(true);
    }
  });

  it('should accept an ArrayBuffer secret', async () => {
    const body = '{}';
    const secretBuf = new TextEncoder().encode('secret123').buffer;
    // Compute via string-imported key for the expected sig.
    const sig = await computeHmac('secret123', body);
    const verify = verifyHmac({
      secret: secretBuf,
      headerName: 'x-sig',
    });
    const ok = await verify(body, responseWithHeader('x-sig', sig));
    expect(ok).toBe(true);
  });

  it('should accept a pre-imported CryptoKey', async () => {
    const body = '{}';
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('secret123'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await computeHmac('secret123', body);
    const verify = verifyHmac({
      secret: cryptoKey,
      headerName: 'x-sig',
    });
    const ok = await verify(body, responseWithHeader('x-sig', sig));
    expect(ok).toBe(true);
  });

  it('should be timing-resistant: equal-length wrong sig still returns false', async () => {
    const body = '{}';
    const realSig = await computeHmac('secret', body);
    const wrong = '0'.repeat(realSig.length);
    const verify = verifyHmac({ secret: 'secret', headerName: 'x-sig' });
    expect(await verify(body, responseWithHeader('x-sig', wrong))).toBe(false);
  });
});
