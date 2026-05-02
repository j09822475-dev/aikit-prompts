import { describe, expect, it } from 'vitest';
import {
  parse,
  isValid,
  compare,
  satisfies,
  lt,
  gt,
  eq,
} from '../versioning/semver.js';
import { VersionError } from '../errors/version-error.js';

describe('parse', () => {
  it('should parse a basic MAJOR.MINOR.PATCH string into components', () => {
    const v = parse('1.2.3');
    expect(v.major).toBe(1);
    expect(v.minor).toBe(2);
    expect(v.patch).toBe(3);
    expect(v.prerelease).toBeUndefined();
    expect(v.raw).toBe('1.2.3');
  });

  it('should preserve a pre-release identifier', () => {
    const v = parse('1.0.0-beta.1');
    expect(v.prerelease).toBe('beta.1');
  });

  it('should accept and discard build metadata', () => {
    const v = parse('1.0.0+abc.def');
    expect(v.major).toBe(1);
    expect(v.minor).toBe(0);
    expect(v.patch).toBe(0);
  });

  it('should throw VersionError on malformed input', () => {
    expect(() => parse('invalid')).toThrowError(VersionError);
    expect(() => parse('1.2')).toThrowError(VersionError);
    expect(() => parse('')).toThrowError(VersionError);
  });
});

describe('isValid', () => {
  it('should report valid SemVer strings as valid', () => {
    expect(isValid('1.2.3')).toBe(true);
    expect(isValid('0.0.0')).toBe(true);
    expect(isValid('1.0.0-beta')).toBe(true);
  });

  it('should report invalid strings as invalid', () => {
    expect(isValid('x.y.z')).toBe(false);
    expect(isValid('1.0')).toBe(false);
    expect(isValid('')).toBe(false);
  });
});

describe('compare / lt / gt / eq', () => {
  it('should compare by major then minor then patch', () => {
    expect(compare(parse('1.0.0'), parse('2.0.0'))).toBeLessThan(0);
    expect(compare(parse('2.0.0'), parse('1.0.0'))).toBeGreaterThan(0);
    expect(compare(parse('1.0.0'), parse('1.1.0'))).toBeLessThan(0);
    expect(compare(parse('1.0.0'), parse('1.0.1'))).toBeLessThan(0);
    expect(compare(parse('1.2.3'), parse('1.2.3'))).toBe(0);
  });

  it('should rank pre-release versions before their stable counterparts', () => {
    expect(
      compare(parse('1.0.0-beta'), parse('1.0.0')),
    ).toBeLessThan(0);
    expect(
      compare(parse('1.0.0'), parse('1.0.0-beta')),
    ).toBeGreaterThan(0);
  });

  it('should compare prerelease identifiers numerically when both are numeric', () => {
    expect(
      compare(parse('1.0.0-beta.2'), parse('1.0.0-beta.10')),
    ).toBeLessThan(0);
  });

  it('should compare prerelease identifiers lexically when non-numeric', () => {
    expect(
      compare(parse('1.0.0-alpha'), parse('1.0.0-beta')),
    ).toBeLessThan(0);
  });

  it('should treat numeric vs non-numeric segments by SemVer rule', () => {
    expect(
      compare(parse('1.0.0-1'), parse('1.0.0-alpha')),
    ).toBeLessThan(0);
  });

  it('should expose lt/gt/eq helpers wrapping compare', () => {
    expect(lt(parse('1.0.0'), parse('2.0.0'))).toBe(true);
    expect(gt(parse('2.0.0'), parse('1.0.0'))).toBe(true);
    expect(eq(parse('1.0.0'), parse('1.0.0'))).toBe(true);
  });

  it('should rank longer prerelease as greater when shared prefix matches', () => {
    expect(
      compare(parse('1.0.0-alpha'), parse('1.0.0-alpha.1')),
    ).toBeLessThan(0);
  });
});

describe('satisfies — exact and wildcard', () => {
  it('should return true for empty / star / x ranges', () => {
    expect(satisfies(parse('1.2.3'), '*')).toBe(true);
    expect(satisfies(parse('1.2.3'), 'x')).toBe(true);
    expect(satisfies(parse('1.2.3'), '')).toBe(true);
  });

  it('should match an exact version when no operator is supplied', () => {
    expect(satisfies(parse('1.2.3'), '1.2.3')).toBe(true);
    expect(satisfies(parse('1.2.3'), '1.2.4')).toBe(false);
  });

  it('should match a major-only range when minor and patch are wildcards', () => {
    expect(satisfies(parse('1.5.7'), '1')).toBe(true);
    expect(satisfies(parse('2.0.0'), '1')).toBe(false);
    expect(satisfies(parse('1.2.3'), '1.x')).toBe(true);
    expect(satisfies(parse('2.0.0'), '1.x')).toBe(false);
  });
});

describe('satisfies — caret and tilde', () => {
  it('should accept any 1.x version under ^1.0.0', () => {
    expect(satisfies(parse('1.0.0'), '^1.0.0')).toBe(true);
    expect(satisfies(parse('1.5.7'), '^1.0.0')).toBe(true);
    expect(satisfies(parse('1.99.99'), '^1.0.0')).toBe(true);
  });

  it('should reject a different major under caret', () => {
    expect(satisfies(parse('2.0.0'), '^1.0.0')).toBe(false);
    expect(satisfies(parse('0.0.0'), '^1.0.0')).toBe(false);
  });

  it('should pin to a minor under ~1.2.0', () => {
    expect(satisfies(parse('1.2.0'), '~1.2.0')).toBe(true);
    expect(satisfies(parse('1.2.5'), '~1.2.0')).toBe(true);
    expect(satisfies(parse('1.3.0'), '~1.2.0')).toBe(false);
    expect(satisfies(parse('1.1.0'), '~1.2.0')).toBe(false);
  });

  it('should treat ~1 as the entire 1.x range', () => {
    expect(satisfies(parse('1.0.0'), '~1')).toBe(true);
    expect(satisfies(parse('1.99.99'), '~1')).toBe(true);
    expect(satisfies(parse('2.0.0'), '~1')).toBe(false);
  });

  it('should treat ^0.x.y as locked to a minor', () => {
    expect(satisfies(parse('0.5.0'), '^0.5.0')).toBe(true);
    expect(satisfies(parse('0.5.7'), '^0.5.0')).toBe(true);
    expect(satisfies(parse('0.6.0'), '^0.5.0')).toBe(false);
  });

  it('should treat ^0.0.x as locked to a patch', () => {
    expect(satisfies(parse('0.0.5'), '^0.0.5')).toBe(true);
    expect(satisfies(parse('0.0.4'), '^0.0.5')).toBe(false);
    expect(satisfies(parse('0.1.0'), '^0.0.5')).toBe(false);
  });
});

describe('satisfies — comparison operators', () => {
  it('should support >=, <=, >, < and =', () => {
    expect(satisfies(parse('1.5.0'), '>=1.0.0')).toBe(true);
    expect(satisfies(parse('1.5.0'), '<=2.0.0')).toBe(true);
    expect(satisfies(parse('1.5.0'), '>1.0.0')).toBe(true);
    expect(satisfies(parse('1.5.0'), '<2.0.0')).toBe(true);
    expect(satisfies(parse('1.5.0'), '=1.5.0')).toBe(true);
    expect(satisfies(parse('1.5.0'), '<1.0.0')).toBe(false);
  });

  it('should match major when "=1" is provided', () => {
    expect(satisfies(parse('1.5.0'), '=1')).toBe(true);
    expect(satisfies(parse('2.0.0'), '=1')).toBe(false);
  });

  it('should match major.minor when "=1.5" is provided', () => {
    expect(satisfies(parse('1.5.7'), '=1.5')).toBe(true);
    expect(satisfies(parse('1.6.0'), '=1.5')).toBe(false);
  });
});

describe('satisfies — error paths', () => {
  it('should throw VersionError on a malformed range atom', () => {
    expect(() => satisfies(parse('1.0.0'), '???')).toThrowError(VersionError);
  });
});
