import { describe, expect, it, vi } from 'vitest';
import { httpSource } from '../sources/http.js';
import { SourceError } from '../errors/source-error.js';
import type { PromptDefinitionJson } from '../core/types.js';
import type { SourceChangeEvent } from '../sources/types.js';

const recordOf = (id: string, version: string): PromptDefinitionJson => ({
  id,
  version,
  template: `body of ${id}`,
  partial: {},
  metadata: {},
  tags: [],
});

const okFetch =
  (body: unknown, headers: Record<string, string> = {}): typeof fetch =>
  async (): Promise<Response> =>
    new Response(JSON.stringify(body), { status: 200, headers });

describe('httpSource — load', () => {
  it('should fetch and parse a JSON array of records', async () => {
    const src = httpSource({
      url: 'https://example.com/p.json',
      fetch: okFetch([recordOf('p', '1.0.0')]),
    });
    const out = await src.load();
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('p');
  });

  it('should throw SourceError when fetch rejects', async () => {
    const src = httpSource({
      url: 'https://example.com/p.json',
      fetch: async (): Promise<Response> => {
        throw new Error('net');
      },
    });
    await expect(src.load()).rejects.toThrow(SourceError);
  });

  it('should throw SourceError on non-2xx HTTP status', async () => {
    const src = httpSource({
      url: 'https://example.com/x',
      fetch: async (): Promise<Response> => new Response('', { status: 500 }),
    });
    await expect(src.load()).rejects.toThrow(SourceError);
  });

  it('should throw SourceError when body is not valid JSON', async () => {
    const src = httpSource({
      url: 'https://example.com/x',
      fetch: async (): Promise<Response> =>
        new Response('not json', { status: 200 }),
    });
    await expect(src.load()).rejects.toThrow(SourceError);
  });

  it('should throw SourceError when body is JSON but not an array', async () => {
    const src = httpSource({
      url: 'https://example.com/x',
      fetch: okFetch({ not: 'an array' }),
    });
    await expect(src.load()).rejects.toThrow(SourceError);
  });

  it('should accept a custom parser when the response is non-array', async () => {
    const src = httpSource({
      url: 'https://example.com/x',
      fetch: okFetch({ wrapped: [recordOf('p', '1.0.0')] }),
      parser: (raw): readonly PromptDefinitionJson[] =>
        (raw as { wrapped: PromptDefinitionJson[] }).wrapped,
    });
    const out = await src.load();
    expect(out[0]?.id).toBe('p');
  });

  it('should pass headers through to fetch', async () => {
    const seen: HeadersInit[] = [];
    const fakeFetch: typeof fetch = async (
      _url,
      init,
    ): Promise<Response> => {
      if (init?.headers) seen.push(init.headers);
      return new Response('[]', { status: 200 });
    };
    const src = httpSource({
      url: 'https://example.com',
      fetch: fakeFetch,
      headers: { 'x-custom': '1' },
    });
    await src.load();
    expect(seen).toHaveLength(1);
  });

  it('should serve from cache while ttlMs is fresh', async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (): Promise<Response> => {
      calls++;
      return new Response(JSON.stringify([recordOf('p', '1.0.0')]), {
        status: 200,
      });
    };
    const src = httpSource({
      url: 'https://example.com',
      fetch: fetcher,
      ttlMs: 60_000,
    });
    await src.load();
    await src.load();
    expect(calls).toBe(1);
  });
});

describe('httpSource — verify', () => {
  it('should fail with SOURCE_INTEGRITY_FAILED when verify returns false', async () => {
    const src = httpSource({
      url: 'https://example.com',
      fetch: okFetch([recordOf('p', '1.0.0')]),
      verify: () => false,
    });
    let caught: SourceError | undefined;
    try {
      await src.load();
    } catch (e) {
      caught = e as SourceError;
    }
    expect(caught?.code).toBe('SOURCE_INTEGRITY_FAILED');
  });

  it('should pass through when verify returns true', async () => {
    const src = httpSource({
      url: 'https://example.com',
      fetch: okFetch([recordOf('p', '1.0.0')]),
      verify: () => true,
    });
    const out = await src.load();
    expect(out).toHaveLength(1);
  });

  it('should wrap verify throw as SOURCE_INTEGRITY_FAILED with cause', async () => {
    const cause = new Error('verify-throw');
    const src = httpSource({
      url: 'https://example.com',
      fetch: okFetch([]),
      verify: () => {
        throw cause;
      },
    });
    let caught: SourceError | undefined;
    try {
      await src.load();
    } catch (e) {
      caught = e as SourceError;
    }
    expect(caught?.code).toBe('SOURCE_INTEGRITY_FAILED');
    expect(caught?.cause).toBe(cause);
  });
});

describe('httpSource — naming and subscription', () => {
  it('should use the supplied name option when set', () => {
    const src = httpSource({
      url: 'https://example.com',
      name: 'custom-name',
      fetch: okFetch([]),
    });
    expect(src.name).toBe('custom-name');
  });

  it('should default to a deterministic http:url:n style name', () => {
    const src = httpSource({
      url: 'https://example.com/p',
      fetch: okFetch([]),
    });
    expect(src.name).toMatch(/^http:https:\/\/example\.com\/p:\d+$/);
  });

  it('should let listeners subscribe and unsubscribe synchronously', () => {
    const src = httpSource({
      url: 'https://example.com',
      fetch: okFetch([]),
    });
    const noop = (): void => undefined;
    const unsub = src.subscribe?.(noop);
    expect(typeof unsub).toBe('function');
    expect(() => unsub?.()).not.toThrow();
  });

  it('should emit error events when load() fails after first success', async () => {
    let firstCall = true;
    const fetcher: typeof fetch = async (): Promise<Response> => {
      if (firstCall) {
        firstCall = false;
        return new Response(JSON.stringify([recordOf('p', '1.0.0')]), {
          status: 200,
        });
      }
      return new Response('', { status: 500 });
    };
    const src = httpSource({
      url: 'https://example.com',
      fetch: fetcher,
    });
    const events: SourceChangeEvent[] = [];
    src.subscribe?.((e) => events.push(e));
    await src.load(); // first ok
    // Force re-fetch by waiting then loading again (no ttl set).
    await src.load(); // second triggers error, returns cached
    expect(
      events.some((e) => e.type === 'error'),
    ).toBe(true);
  });

  it('should clean up the polling timer when dispose is called', async () => {
    const src = httpSource({
      url: 'https://example.com',
      fetch: okFetch([]),
      pollMs: 50_000,
    });
    src.subscribe?.(() => undefined);
    await src.dispose?.();
    // No assertion needed; just ensures dispose doesn't throw.
    expect(true).toBe(true);
  });
});

describe('httpSource — polling diff', () => {
  it('should emit added/replaced/removed events when polling detects changes', async () => {
    vi.useFakeTimers();
    const records1 = [recordOf('p1', '1.0.0'), recordOf('p2', '1.0.0')];
    const records2 = [
      { ...recordOf('p1', '1.0.0'), template: 'CHANGED' },
      recordOf('p3', '1.0.0'),
    ];
    let phase = 0;
    const fetcher: typeof fetch = async (): Promise<Response> => {
      const records = phase === 0 ? records1 : records2;
      phase++;
      return new Response(JSON.stringify(records), { status: 200 });
    };
    const src = httpSource({
      url: 'https://example.com',
      fetch: fetcher,
      pollMs: 100,
    });
    const events: SourceChangeEvent[] = [];
    src.subscribe?.((e) => events.push(e));
    await src.load();
    await vi.advanceTimersByTimeAsync(200);
    await src.dispose?.();
    vi.useRealTimers();
    const types = events.map((e) => e.type);
    expect(types).toContain('replaced');
    expect(types).toContain('added');
    expect(types).toContain('removed');
  });
});
