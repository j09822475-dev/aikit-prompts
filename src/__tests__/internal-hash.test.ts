import { describe, expect, it, expectTypeOf } from 'vitest';
import { fnv1a32 } from '../internal/hash.js';

describe('fnv1a32', () => {
  it('should produce a stable 32-bit unsigned integer when called repeatedly', () => {
    const a = fnv1a32('hello');
    const b = fnv1a32('hello');
    expect(a).toBe(b);
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
  });

  it('should return the FNV-1a offset basis when called with an empty string', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
  });

  it('should produce different hashes when inputs differ by a single character', () => {
    expect(fnv1a32('a')).not.toBe(fnv1a32('b'));
    expect(fnv1a32('aa')).not.toBe(fnv1a32('ab'));
  });

  it('should match the canonical FNV-1a 32 hash for known strings', () => {
    // Canonical reference values from FNV reference implementation for ASCII inputs.
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('should hash UTF-16 code units consistently for non-ASCII inputs', () => {
    const value = fnv1a32('café');
    expect(value).toBe(fnv1a32('café'));
    expect(typeof value).toBe('number');
  });

  it('should return type number from the function signature', () => {
    expectTypeOf(fnv1a32).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(fnv1a32).returns.toEqualTypeOf<number>();
  });
});
