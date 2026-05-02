import { SourceError } from '../errors/source-error.js';
import type { PromptDefinitionJson } from '../core/types.js';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const SEMVER_REGEX =
  /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parse a single record into a strict `PromptDefinitionJson`. Rejects
 * unknown fields and validates required ones. Used by `httpSource`,
 * `fsSource`, and `memorySource` parsers.
 *
 * @param raw        Raw record (typically JSON-decoded).
 * @param sourceName Source name for diagnostic context.
 * @returns The validated `PromptDefinitionJson`.
 *
 * @throws {SourceError} (`code: 'SOURCE_PARSE_FAILED'`) on shape errors.
 */
export function parsePromptRecord(
  raw: unknown,
  sourceName: string,
): PromptDefinitionJson {
  if (!isPlainObject(raw)) {
    throw new SourceError(
      'SOURCE_PARSE_FAILED',
      `Prompt record must be a plain object`,
      { sourceName },
    );
  }
  const allowed = new Set([
    'id',
    'version',
    'template',
    'partial',
    'metadata',
    'tags',
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new SourceError(
        'SOURCE_PARSE_FAILED',
        `Unknown field '${key}' in prompt record`,
        { sourceName },
      );
    }
  }

  const id = raw['id'];
  if (typeof id !== 'string' || id.length === 0) {
    throw new SourceError(
      'SOURCE_PARSE_FAILED',
      `Prompt record requires 'id' string`,
      { sourceName },
    );
  }
  const template = raw['template'];
  if (typeof template !== 'string') {
    throw new SourceError(
      'SOURCE_PARSE_FAILED',
      `Prompt record '${id}' requires 'template' string`,
      { sourceName },
    );
  }
  const versionRaw = raw['version'];
  let version: string | undefined;
  if (versionRaw !== undefined) {
    if (typeof versionRaw !== 'string') {
      throw new SourceError(
        'SOURCE_PARSE_FAILED',
        `Prompt record '${id}' has invalid 'version' (expected string)`,
        { sourceName },
      );
    }
    if (!SEMVER_REGEX.test(versionRaw)) {
      throw new SourceError(
        'SOURCE_PARSE_FAILED',
        `Prompt record '${id}' has invalid SemVer version '${versionRaw}'`,
        { sourceName },
      );
    }
    version = versionRaw;
  }
  const partial = isPlainObject(raw['partial'])
    ? (raw['partial'] as Record<string, unknown>)
    : {};
  const metadata = isPlainObject(raw['metadata'])
    ? (raw['metadata'] as Record<string, unknown>)
    : {};
  const tagsRaw = raw['tags'];
  const tags: string[] = [];
  if (Array.isArray(tagsRaw)) {
    for (const t of tagsRaw) {
      if (typeof t !== 'string') {
        throw new SourceError(
          'SOURCE_PARSE_FAILED',
          `Prompt record '${id}' has non-string entry in 'tags'`,
          { sourceName },
        );
      }
      tags.push(t);
    }
  }
  return Object.freeze({
    id,
    version,
    template,
    partial: { ...partial },
    metadata: { ...metadata },
    tags,
  });
}

/**
 * Parse an array of raw records. Records that fail individual
 * validation are skipped via `onError`, so a single bad record does
 * not poison an entire load.
 *
 * @param raws       Array of raw records.
 * @param sourceName Source name for diagnostic context.
 * @param onError    Optional sink for per-record errors.
 * @returns Array of successfully parsed records.
 */
export function parsePromptRecords(
  raws: readonly unknown[],
  sourceName: string,
  onError?: (error: SourceError) => void,
): readonly PromptDefinitionJson[] {
  const out: PromptDefinitionJson[] = [];
  for (const raw of raws) {
    try {
      out.push(parsePromptRecord(raw, sourceName));
    } catch (e) {
      if (e instanceof SourceError && onError) onError(e);
      else if (!onError) throw e;
    }
  }
  return out;
}
