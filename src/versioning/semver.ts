import { VersionError } from '../errors/version-error.js';

/** Parsed `MAJOR.MINOR.PATCH[-prerelease]` SemVer tuple. */
export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Pre-release identifier (e.g. `'beta.1'`) or `undefined`. */
  readonly prerelease?: string;
  /** The raw input string the SemVer was parsed from. */
  readonly raw: string;
}

const SEMVER_REGEX =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parse a SemVer string into its components. Build metadata
 * (`+abc.def`) is allowed in input but discarded — we only model the
 * subset relevant to range matching.
 *
 * @param input SemVer string (e.g. `'1.2.3'`, `'1.0.0-beta.1'`).
 * @returns The parsed `SemVer`.
 *
 * @throws {VersionError} (`code: 'VERSION_INVALID'`) on malformed input.
 *
 * @example
 * parse('1.2.3-beta.1'); // { major: 1, minor: 2, patch: 3, prerelease: 'beta.1', raw: ... }
 */
export function parse(input: string): SemVer {
  const match = SEMVER_REGEX.exec(input);
  if (!match) {
    throw new VersionError(
      'VERSION_INVALID',
      `Invalid SemVer string: '${input}'`,
      { selector: input },
    );
  }
  const [, majorStr = '0', minorStr = '0', patchStr = '0', pre] = match;
  return Object.freeze({
    major: Number.parseInt(majorStr, 10),
    minor: Number.parseInt(minorStr, 10),
    patch: Number.parseInt(patchStr, 10),
    ...(pre !== undefined ? { prerelease: pre } : {}),
    raw: input,
  });
}

/**
 * Test whether a string is a valid SemVer.
 *
 * @param input Candidate version string.
 * @returns `true` when `parse(input)` would succeed.
 */
export const isValid = (input: string): boolean => SEMVER_REGEX.test(input);

const comparePrerelease = (
  a: string | undefined,
  b: string | undefined,
): number => {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  const aParts = a.split('.');
  const bParts = b.split('.');
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const av = aParts[i];
    const bv = bParts[i];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    const aNum = /^\d+$/.test(av) ? Number.parseInt(av, 10) : null;
    const bNum = /^\d+$/.test(bv) ? Number.parseInt(bv, 10) : null;
    if (aNum !== null && bNum !== null) {
      if (aNum !== bNum) return aNum - bNum;
      continue;
    }
    if (aNum !== null) return -1;
    if (bNum !== null) return 1;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
};

/**
 * Compare two SemVer values. Returns negative if `a` precedes `b`,
 * positive if `a` follows `b`, zero if they are equal.
 *
 * @param a First SemVer.
 * @param b Second SemVer.
 * @returns `-1`, `0`, or `1`-class number suitable for `Array#sort`.
 */
export function compare(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/** True when `a` comes before `b`. */
export const lt = (a: SemVer, b: SemVer): boolean => compare(a, b) < 0;
/** True when `a` comes after `b`. */
export const gt = (a: SemVer, b: SemVer): boolean => compare(a, b) > 0;
/** True when `a` equals `b`. */
export const eq = (a: SemVer, b: SemVer): boolean => compare(a, b) === 0;

const stripOperator = (
  input: string,
): { op: string; rest: string } => {
  const trimmed = input.trim();
  if (trimmed.startsWith('>=')) return { op: '>=', rest: trimmed.slice(2) };
  if (trimmed.startsWith('<=')) return { op: '<=', rest: trimmed.slice(2) };
  if (trimmed.startsWith('>')) return { op: '>', rest: trimmed.slice(1) };
  if (trimmed.startsWith('<')) return { op: '<', rest: trimmed.slice(1) };
  if (trimmed.startsWith('=')) return { op: '=', rest: trimmed.slice(1) };
  if (trimmed.startsWith('^')) return { op: '^', rest: trimmed.slice(1) };
  if (trimmed.startsWith('~')) return { op: '~', rest: trimmed.slice(1) };
  return { op: '=', rest: trimmed };
};

const parseRangeAtom = (
  raw: string,
): { major: number; minor?: number; patch?: number; prerelease?: string } => {
  const m =
    /^(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:-([0-9A-Za-z.-]+))?$/.exec(
      raw,
    );
  if (!m) {
    throw new VersionError(
      'VERSION_RANGE_INVALID',
      `Invalid version range atom: '${raw}'`,
      { selector: raw },
    );
  }
  const num = (s: string | undefined): number | undefined => {
    if (s === undefined || s === 'x' || s === '*') return undefined;
    return Number.parseInt(s, 10);
  };
  const major = num(m[1]);
  if (major === undefined) {
    return { major: 0 };
  }
  const out: {
    major: number;
    minor?: number;
    patch?: number;
    prerelease?: string;
  } = { major };
  const minor = num(m[2]);
  if (minor !== undefined) out.minor = minor;
  const patch = num(m[3]);
  if (patch !== undefined) out.patch = patch;
  if (m[4] !== undefined) out.prerelease = m[4];
  return out;
};

/**
 * Test whether a `SemVer` satisfies a single-clause range expression.
 *
 * Supported operators: exact (`'1.2.3'`), `^`, `~`, `>=`, `<=`, `>`,
 * `<`, `=`. `x` / `*` wildcards are recognized in either component
 * position. Compound `||` / `&&` ranges are intentionally out of scope.
 *
 * @param version SemVer to test.
 * @param range   Range expression.
 * @returns `true` when the version satisfies the range.
 *
 * @throws {VersionError} (`code: 'VERSION_RANGE_INVALID'`) on malformed range.
 *
 * @example
 * satisfies(parse('1.2.3'), '^1.0.0'); // true
 * satisfies(parse('2.0.0'), '^1.0.0'); // false
 */
export function satisfies(version: SemVer, range: string): boolean {
  const trimmed = range.trim();
  if (trimmed === '' || trimmed === '*' || trimmed === 'x') return true;

  const { op, rest } = stripOperator(trimmed);
  const atom = parseRangeAtom(rest);

  if (op === '^') return satisfiesCaret(version, atom);
  if (op === '~') return satisfiesTilde(version, atom);

  const cmpTarget: SemVer = Object.freeze({
    major: atom.major,
    minor: atom.minor ?? 0,
    patch: atom.patch ?? 0,
    ...(atom.prerelease !== undefined ? { prerelease: atom.prerelease } : {}),
    raw: rest,
  });

  if (op === '=') {
    if (atom.minor === undefined) return version.major === atom.major;
    if (atom.patch === undefined)
      return version.major === atom.major && version.minor === atom.minor;
    return eq(version, cmpTarget);
  }
  if (op === '>') return gt(version, cmpTarget);
  if (op === '<') return lt(version, cmpTarget);
  if (op === '>=') return compare(version, cmpTarget) >= 0;
  if (op === '<=') return compare(version, cmpTarget) <= 0;
  return false;
}

const satisfiesCaret = (
  v: SemVer,
  a: { major: number; minor?: number; patch?: number },
): boolean => {
  const lower: SemVer = Object.freeze({
    major: a.major,
    minor: a.minor ?? 0,
    patch: a.patch ?? 0,
    raw: `^${a.major}.${a.minor ?? 0}.${a.patch ?? 0}`,
  });
  if (compare(v, lower) < 0) return false;
  if (a.major > 0) return v.major === a.major;
  if (a.minor !== undefined && a.minor > 0)
    return v.major === 0 && v.minor === a.minor;
  return v.major === 0 && v.minor === (a.minor ?? 0);
};

const satisfiesTilde = (
  v: SemVer,
  a: { major: number; minor?: number; patch?: number },
): boolean => {
  if (a.minor === undefined) return v.major === a.major;
  const lower: SemVer = Object.freeze({
    major: a.major,
    minor: a.minor,
    patch: a.patch ?? 0,
    raw: `~${a.major}.${a.minor}.${a.patch ?? 0}`,
  });
  if (compare(v, lower) < 0) return false;
  return v.major === a.major && v.minor === a.minor;
};
