import { describe, expect, it } from 'vitest';
import {
  resolveVar,
  stringifyValue,
  type RenderContext,
} from '../core/render-context.js';
import { VariableError } from '../errors/variable-error.js';

const makeCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  vars: {},
  partial: {},
  escape: 'none',
  strict: true,
  referenced: new Set(),
  missing: [],
  ...overrides,
});

describe('resolveVar', () => {
  it('should prefer the call-time vars over the partial baseline', () => {
    const ctx = makeCtx({
      vars: { x: 1 },
      partial: { x: 2 },
    });
    expect(resolveVar(ctx, 'x')).toBe(1);
  });

  it('should fall back to partial when vars does not have the key', () => {
    const ctx = makeCtx({
      vars: {},
      partial: { x: 'p' },
    });
    expect(resolveVar(ctx, 'x')).toBe('p');
  });

  it('should return undefined when neither vars nor partial holds the key', () => {
    expect(resolveVar(makeCtx(), 'x')).toBeUndefined();
  });

  it('should return undefined when only inherited keys would match', () => {
    const ctx = makeCtx({
      vars: Object.create({ inherited: 'x' }) as Record<string, unknown>,
    });
    expect(resolveVar(ctx, 'inherited')).toBeUndefined();
  });
});

describe('stringifyValue', () => {
  it('should return an empty string for null and undefined', () => {
    expect(stringifyValue(null, 'x', makeCtx())).toBe('');
    expect(stringifyValue(undefined, 'x', makeCtx())).toBe('');
  });

  it('should stringify primitive values verbatim under escape=none', () => {
    expect(stringifyValue('a', 'x', makeCtx())).toBe('a');
    expect(stringifyValue(42, 'x', makeCtx())).toBe('42');
    expect(stringifyValue(true, 'x', makeCtx())).toBe('true');
    expect(stringifyValue(123n, 'x', makeCtx())).toBe('123');
  });

  it('should JSON-stringify objects when escape=json', () => {
    expect(
      stringifyValue({ a: 1 }, 'x', makeCtx({ escape: 'json' })),
    ).toBe('{"a":1}');
  });

  it('should join arrays with commas under escape=none', () => {
    expect(stringifyValue([1, 2, 3], 'x', makeCtx())).toBe('1, 2, 3');
  });

  it('should throw VariableError on functions, with templateId in details when set', () => {
    let caught: VariableError | undefined;
    try {
      stringifyValue((): void => undefined, 'fn', makeCtx({ templateId: 't1' }));
    } catch (e) {
      caught = e as VariableError;
    }
    expect(caught?.code).toBe('VARIABLE_TYPE_MISMATCH');
    expect(caught?.invalid).toBe('fn');
    expect(caught?.templateId).toBe('t1');
  });

  it('should throw VariableError on symbols', () => {
    expect(() =>
      stringifyValue(Symbol('s'), 'sym', makeCtx()),
    ).toThrowError(VariableError);
  });

  it('should throw VariableError when JSON encoding fails on a circular reference', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    expect(() =>
      stringifyValue(obj, 'circ', makeCtx({ escape: 'json' })),
    ).toThrowError(VariableError);
  });

  it('should escape markdown punctuation when escape=markdown', () => {
    expect(stringifyValue('*x*', 'v', makeCtx({ escape: 'markdown' }))).toBe(
      '\\*x\\*',
    );
  });

  it('should stringify a plain non-array object via String() when escape=none', () => {
    const obj = { toString: (): string => 'custom' };
    expect(stringifyValue(obj, 'v', makeCtx())).toBe('custom');
  });
});
