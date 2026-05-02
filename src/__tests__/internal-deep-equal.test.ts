import { describe, expect, it } from 'vitest';
import { deepEqual } from '../internal/deep-equal.js';

describe('deepEqual', () => {
  it('should return true when two primitives are strictly equal', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it('should return false when types differ', () => {
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual(true, 1)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('should return false when one side is null and the other is an object', () => {
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({}, null)).toBe(false);
  });

  it('should compare arrays element-by-element', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(deepEqual([], [])).toBe(true);
  });

  it('should return false when an array is compared with a plain object', () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2, length: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, [1])).toBe(false);
  });

  it('should compare plain objects key-by-key', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
  });

  it('should descend into nested structures recursively', () => {
    const a = { x: [1, { y: 'z' }] };
    const b = { x: [1, { y: 'z' }] };
    const c = { x: [1, { y: 'q' }] };
    expect(deepEqual(a, b)).toBe(true);
    expect(deepEqual(a, c)).toBe(false);
  });
});
