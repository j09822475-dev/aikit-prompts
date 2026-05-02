import { describe, expect, it } from 'vitest';
import { invariant } from '../internal/invariant.js';
import { InvariantError } from '../errors/misc-errors.js';

describe('invariant', () => {
  it('should not throw when condition is truthy', () => {
    expect(() => invariant(true, 'never')).not.toThrow();
    expect(() => invariant(1, 'never')).not.toThrow();
    expect(() => invariant({}, 'never')).not.toThrow();
    expect(() => invariant('x', 'never')).not.toThrow();
  });

  it('should throw InvariantError carrying the supplied message when condition is falsy', () => {
    let caught: unknown;
    try {
      invariant(false, 'something failed');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvariantError);
    expect((caught as Error).message).toContain('something failed');
    expect((caught as InvariantError).code).toBe('INVARIANT');
  });

  it('should throw for every falsy primitive value', () => {
    for (const falsy of [false, 0, '', null, undefined]) {
      expect(() => invariant(falsy, 'falsy')).toThrow(InvariantError);
    }
  });

  it('should narrow the type of a checked variable downstream', () => {
    const value: string | undefined = 'hello';
    invariant(value !== undefined, 'value defined');
    // After invariant, value should be narrowed to string.
    expect(value.length).toBe(5);
  });
});
