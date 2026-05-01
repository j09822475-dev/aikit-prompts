import { VersionError } from '../errors/version-error.js';
import type { PromptDefinition } from '../core/types.js';
import { compare, isValid, parse, satisfies, type SemVer } from './semver.js';

interface IndexedRecord {
  readonly definition: PromptDefinition;
  readonly version: SemVer;
}

/**
 * Sort a list of records descending by SemVer (latest first). Pre-release
 * versions appear after their corresponding stable versions per SemVer
 * precedence rules.
 *
 * @param records Records to sort.
 * @returns A new array sorted descending. Original input not mutated.
 */
export const sortDescending = (
  records: readonly IndexedRecord[],
): readonly IndexedRecord[] =>
  [...records].sort((a, b) => compare(b.version, a.version));

/**
 * Select a prompt definition matching the supplied selector.
 *
 * @param records   All `(id, version)` records for a given id.
 * @param selector  Optional version selector. `undefined` selects the highest
 *                  stable version. `'1.2.3'` selects an exact match. SemVer
 *                  ranges (`'^1.0.0'`, `'~1.2.0'`, `'1.x'`, `'>=1.0.0'`, `'*'`)
 *                  pick the highest matching version.
 * @param options   `excludePrereleaseFromLatest` (default `true`) controls whether
 *                  pre-release versions are eligible for `'latest'` resolution.
 * @returns The selected `PromptDefinition`.
 *
 * @throws {VersionError} when no version satisfies the selector.
 *
 * @example
 * selectVersion(records);            // latest stable
 * selectVersion(records, '1.0.0');   // exact
 * selectVersion(records, '^1.0.0');  // any 1.x
 */
export function selectVersion(
  records: readonly IndexedRecord[],
  selector: string | undefined,
  options?: { excludePrereleaseFromLatest?: boolean },
): PromptDefinition {
  if (records.length === 0) {
    throw new VersionError(
      'VERSION_NOT_FOUND',
      `No prompts registered for this id`,
      selector !== undefined ? { selector } : undefined,
    );
  }

  const sorted = sortDescending(records);

  if (selector === undefined) {
    const exclude = options?.excludePrereleaseFromLatest ?? true;
    const candidates = exclude
      ? sorted.filter((r) => r.version.prerelease === undefined)
      : sorted;
    const pick =
      candidates.length > 0 ? candidates[0] : sorted[0];
    if (pick === undefined) {
      throw new VersionError(
        'VERSION_NOT_FOUND',
        `No prompts registered for this id`,
      );
    }
    return pick.definition;
  }

  if (isValid(selector)) {
    const target = parse(selector);
    const exact = sorted.find((r) => compare(r.version, target) === 0);
    if (!exact) {
      throw new VersionError(
        'VERSION_NOT_FOUND',
        `No version '${selector}' registered`,
        { selector },
      );
    }
    return exact.definition;
  }

  for (const r of sorted) {
    if (satisfies(r.version, selector)) return r.definition;
  }

  throw new VersionError(
    'VERSION_NOT_FOUND',
    `No version satisfies selector '${selector}'`,
    { selector },
  );
}

/**
 * Build the `IndexedRecord[]` shape `selectVersion` consumes from a
 * list of prompt definitions.
 *
 * @param defs Prompt definitions to index.
 * @returns Indexed records with parsed SemVer.
 *
 * @throws {VersionError} when any definition has an invalid `version`.
 */
export const indexRecords = (
  defs: readonly PromptDefinition[],
): readonly IndexedRecord[] =>
  defs.map((d) => {
    if (typeof d.version !== 'string') {
      throw new VersionError(
        'VERSION_INVALID',
        `Prompt '${d.id}' has no version — registry entries require .version()`,
        { id: d.id },
      );
    }
    return Object.freeze({ definition: d, version: parse(d.version) });
  });
