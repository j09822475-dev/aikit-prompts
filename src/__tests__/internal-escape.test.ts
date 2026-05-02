import { describe, expect, it, expectTypeOf } from 'vitest';
import {
  applyEscape,
  escapeJson,
  escapeMarkdown,
  type EscapeMode,
} from '../internal/escape.js';

describe('escapeMarkdown', () => {
  it('should escape every recognized markdown punctuation when input contains it', () => {
    expect(escapeMarkdown('foo *bar*')).toBe('foo \\*bar\\*');
    expect(escapeMarkdown('a_b')).toBe('a\\_b');
    expect(escapeMarkdown('| ~ > # `')).toBe('\\| \\~ \\> \\# \\`');
    expect(escapeMarkdown('[x]')).toBe('\\[x\\]');
    expect(escapeMarkdown('\\')).toBe('\\\\');
  });

  it('should leave non-special characters untouched when input is plain text', () => {
    expect(escapeMarkdown('plain words 123')).toBe('plain words 123');
  });

  it('should return an empty string when input is empty', () => {
    expect(escapeMarkdown('')).toBe('');
  });
});

describe('escapeJson', () => {
  it('should JSON-stringify primitives and objects', () => {
    expect(escapeJson('hello')).toBe('"hello"');
    expect(escapeJson(42)).toBe('42');
    expect(escapeJson({ a: 1 })).toBe('{"a":1}');
    expect(escapeJson([1, 2, 3])).toBe('[1,2,3]');
    expect(escapeJson(null)).toBe('null');
  });

  it('should throw a TypeError when value contains a circular reference', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    expect(() => escapeJson(obj)).toThrow(TypeError);
  });
});

describe('applyEscape', () => {
  it('should return the value unchanged when mode is none', () => {
    expect(applyEscape('none', 'abc *foo*')).toBe('abc *foo*');
  });

  it('should escape markdown punctuation when mode is markdown', () => {
    expect(applyEscape('markdown', '*x*')).toBe('\\*x\\*');
  });

  it('should JSON-stringify when mode is json', () => {
    expect(applyEscape('json', 'a')).toBe('"a"');
  });

  it('should expose EscapeMode union of three string literals', () => {
    expectTypeOf<EscapeMode>().toEqualTypeOf<'none' | 'markdown' | 'json'>();
  });
});
