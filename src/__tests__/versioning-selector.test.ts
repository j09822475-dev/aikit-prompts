import { describe, expect, it } from 'vitest';
import { selectVersion, indexRecords, sortDescending } from '../versioning/selector.js';
import { prompt } from '../core/prompt.js';
import { VersionError } from '../errors/version-error.js';

const make = (id: string, v: string): ReturnType<typeof prompt> extends infer _ ? ReturnType<typeof prompt> : never => prompt(id) as never;

const def = (id: string, version: string): ReturnType<typeof prompt> extends infer _ ? unknown : never => {
  return prompt(id).version(version).template('hi').build();
};

describe('indexRecords', () => {
  it('should index a list of definitions parsing each version string', () => {
    const records = indexRecords([
      def('p', '1.0.0') as never,
      def('p', '2.0.0') as never,
    ]);
    expect(records).toHaveLength(2);
  });

  it('should throw VersionError for definitions without a version', () => {
    const noVersion = prompt('p').template('hi').build();
    expect(() => indexRecords([noVersion as never])).toThrowError(VersionError);
  });

  it('should throw VersionError for definitions with an invalid SemVer', () => {
    const bad = prompt('p').version('not-a-version').template('hi').build();
    expect(() => indexRecords([bad as never])).toThrowError(VersionError);
  });
});

describe('sortDescending', () => {
  it('should sort records latest first', () => {
    const records = indexRecords([
      def('p', '1.0.0') as never,
      def('p', '2.0.0') as never,
      def('p', '1.5.0') as never,
    ]);
    const sorted = sortDescending(records);
    expect(sorted.map((r) => r.version.raw)).toEqual([
      '2.0.0',
      '1.5.0',
      '1.0.0',
    ]);
  });
});

describe('selectVersion', () => {
  const records = indexRecords([
    def('p', '1.0.0') as never,
    def('p', '1.5.0') as never,
    def('p', '2.0.0') as never,
    def('p', '2.1.0-beta.1') as never,
  ]);

  it('should pick the highest stable version when no selector is supplied', () => {
    const v = selectVersion(records, undefined);
    expect(v.version).toBe('2.0.0');
  });

  it('should include pre-release in latest when excludePrereleaseFromLatest is false', () => {
    const v = selectVersion(records, undefined, {
      excludePrereleaseFromLatest: false,
    });
    expect(v.version).toBe('2.1.0-beta.1');
  });

  it('should resolve an exact selector via SemVer equality', () => {
    expect(selectVersion(records, '1.0.0').version).toBe('1.0.0');
    expect(selectVersion(records, '1.5.0').version).toBe('1.5.0');
  });

  it('should throw VersionError when an exact selector finds nothing', () => {
    expect(() => selectVersion(records, '9.0.0')).toThrowError(VersionError);
  });

  it('should resolve a range selector to the highest matching version', () => {
    expect(selectVersion(records, '^1.0.0').version).toBe('1.5.0');
    expect(selectVersion(records, '~1.0.0').version).toBe('1.0.0');
  });

  it('should throw when no version satisfies a range', () => {
    expect(() => selectVersion(records, '^9.0.0')).toThrowError(VersionError);
  });

  it('should throw VERSION_NOT_FOUND on an empty record list', () => {
    let caught: VersionError | undefined;
    try {
      selectVersion([], '1.0.0');
    } catch (e) {
      caught = e as VersionError;
    }
    expect(caught?.code).toBe('VERSION_NOT_FOUND');
  });

  it('should fall back to the highest pre-release when only pre-releases exist and exclude is on', () => {
    const onlyPre = indexRecords([def('p', '1.0.0-alpha') as never]);
    const v = selectVersion(onlyPre, undefined);
    expect(v.version).toBe('1.0.0-alpha');
  });
});
