import { describe, expect, it } from 'vitest';
import {
  stickyUserOrSession,
  identifierFromKey,
} from '../testing/traffic.js';

describe('stickyUserOrSession', () => {
  it('should return userId when present', () => {
    expect(stickyUserOrSession({ userId: 'u1' })).toBe('u1');
  });

  it('should fall back to sessionId when userId is missing', () => {
    expect(stickyUserOrSession({ sessionId: 's1' })).toBe('s1');
  });

  it('should prefer userId over sessionId when both are present', () => {
    expect(stickyUserOrSession({ userId: 'u1', sessionId: 's1' })).toBe('u1');
  });

  it('should return undefined when neither is present', () => {
    expect(stickyUserOrSession({})).toBeUndefined();
  });
});

describe('identifierFromKey', () => {
  it('should pull a string-typed key from the assignment context', () => {
    const fn = identifierFromKey('accountId');
    expect(fn({ accountId: 'acct-1' })).toBe('acct-1');
  });

  it('should return undefined when the key is missing', () => {
    const fn = identifierFromKey('accountId');
    expect(fn({})).toBeUndefined();
  });

  it('should return undefined when the value is not a string', () => {
    const fn = identifierFromKey('accountId');
    expect(fn({ accountId: 42 })).toBeUndefined();
    expect(fn({ accountId: { x: 1 } })).toBeUndefined();
    expect(fn({ accountId: null })).toBeUndefined();
  });
});

describe('hash exports', () => {
  it('should expose fnv1a32 and bucketize from testing/hash', async () => {
    const mod = await import('../testing/hash.js');
    expect(typeof mod.fnv1a32).toBe('function');
    expect(typeof mod.bucketize).toBe('function');
  });

  it('should compute bucketize as a value in [0, 1)', async () => {
    const { bucketize } = await import('../testing/hash.js');
    for (const s of ['a', 'b', 'long-identifier-string']) {
      const v = bucketize(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('should be deterministic across repeated calls', async () => {
    const { bucketize } = await import('../testing/hash.js');
    expect(bucketize('foo')).toBe(bucketize('foo'));
  });
});
