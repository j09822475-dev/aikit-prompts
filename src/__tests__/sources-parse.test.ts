import { describe, expect, it } from 'vitest';
import { parsePromptRecord, parsePromptRecords } from '../sources/parse.js';
import { SourceError } from '../errors/source-error.js';

describe('parsePromptRecord', () => {
  it('should parse a complete valid record into a frozen PromptDefinitionJson', () => {
    const r = parsePromptRecord(
      {
        id: 'p',
        version: '1.0.0',
        template: 'Hi {{x}}',
        partial: { x: 'world' },
        metadata: { owner: 'alice' },
        tags: ['beta'],
      },
      'src',
    );
    expect(r.id).toBe('p');
    expect(r.version).toBe('1.0.0');
    expect(r.template).toBe('Hi {{x}}');
    expect(r.partial).toEqual({ x: 'world' });
    expect(r.metadata).toEqual({ owner: 'alice' });
    expect(r.tags).toEqual(['beta']);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('should accept a record with optional fields omitted', () => {
    const r = parsePromptRecord({ id: 'p', template: 'hi' }, 'src');
    expect(r.id).toBe('p');
    expect(r.version).toBeUndefined();
    expect(r.partial).toEqual({});
    expect(r.metadata).toEqual({});
    expect(r.tags).toEqual([]);
  });

  it('should throw SourceError when raw is not a plain object', () => {
    expect(() => parsePromptRecord('not-an-object', 'src')).toThrow(
      SourceError,
    );
    expect(() => parsePromptRecord([], 'src')).toThrow(SourceError);
    expect(() => parsePromptRecord(null, 'src')).toThrow(SourceError);
  });

  it('should reject unknown fields in the record', () => {
    expect(() =>
      parsePromptRecord({ id: 'p', template: 'x', bogus: true }, 'src'),
    ).toThrow(SourceError);
  });

  it('should reject when id is missing or non-string', () => {
    expect(() => parsePromptRecord({ template: 'x' }, 'src')).toThrow(
      SourceError,
    );
    expect(() => parsePromptRecord({ id: 5, template: 'x' }, 'src')).toThrow(
      SourceError,
    );
    expect(() => parsePromptRecord({ id: '', template: 'x' }, 'src')).toThrow(
      SourceError,
    );
  });

  it('should reject when template is missing or non-string', () => {
    expect(() => parsePromptRecord({ id: 'p' }, 'src')).toThrow(SourceError);
    expect(() =>
      parsePromptRecord({ id: 'p', template: 5 }, 'src'),
    ).toThrow(SourceError);
  });

  it('should reject a non-string version', () => {
    expect(() =>
      parsePromptRecord({ id: 'p', template: 'x', version: 1 }, 'src'),
    ).toThrow(SourceError);
  });

  it('should reject a malformed SemVer version string', () => {
    expect(() =>
      parsePromptRecord(
        { id: 'p', template: 'x', version: 'not-semver' },
        'src',
      ),
    ).toThrow(SourceError);
  });

  it('should reject non-string entries in tags', () => {
    expect(() =>
      parsePromptRecord({ id: 'p', template: 'x', tags: ['a', 5] }, 'src'),
    ).toThrow(SourceError);
  });

  it('should ignore non-object partial and metadata by defaulting to empty', () => {
    const r = parsePromptRecord(
      { id: 'p', template: 'x', partial: 'invalid', metadata: null },
      'src',
    );
    expect(r.partial).toEqual({});
    expect(r.metadata).toEqual({});
  });
});

describe('parsePromptRecords', () => {
  it('should return an array of valid records skipping bad ones via onError', () => {
    const errors: SourceError[] = [];
    const out = parsePromptRecords(
      [
        { id: 'p1', template: 'x' },
        { id: 'p2' }, // invalid: missing template
        { id: 'p3', template: 'y' },
      ],
      'src',
      (e) => errors.push(e),
    );
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id)).toEqual(['p1', 'p3']);
    expect(errors).toHaveLength(1);
  });

  it('should rethrow when onError is not supplied', () => {
    expect(() =>
      parsePromptRecords([{ id: 'p1' }], 'src'),
    ).toThrow(SourceError);
  });
});
