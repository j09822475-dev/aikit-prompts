import { encodingForModel, getEncoding } from 'js-tiktoken';
import { CostError } from '../errors/cost-error.js';
import type { TokenizerFn } from './types.js';

/**
 * Map of `model` → tiktoken encoding name. The `js-tiktoken` package's
 * `encodingForModel` covers the same mapping internally; we keep a
 * tiny override list for models not yet known to that table.
 */
const ENCODING_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',
  'o1': 'o200k_base',
  'o1-mini': 'o200k_base',
});

let warnedOnFallback = false;

/**
 * Build a `TokenizerFn` backed by `js-tiktoken` for the given model.
 *
 * `js-tiktoken` is a synchronous peer dependency — the encoder is
 * resolved up front so the returned tokenizer is safe to pass directly
 * to `estimateCost({ tokenizer })`. The library never bundles
 * `js-tiktoken` into core: this module ships as its own subpath entry
 * (`@aikit/prompts/cost/tiktoken`) with `js-tiktoken` declared as an
 * external in the bundler config.
 *
 * Unknown models fall back to `cl100k_base` with a one-time
 * `console.warn` and a tagged `id` (`'tiktoken/cl100k_base (fallback)'`)
 * so the caller can detect the fallback at the value level.
 *
 * @param model Model id (e.g. `'gpt-4o'`).
 * @returns A `TokenizerFn` accepted by `estimateCost({ tokenizer })`.
 *
 * @throws {CostError} (`code: 'COST_UNKNOWN_MODEL'`) when the encoder
 *   cannot be constructed (e.g. corrupted `js-tiktoken` install).
 *
 * @example
 * import { estimateCost } from '@aikit/prompts/cost';
 * import { tiktokenFor } from '@aikit/prompts/cost/tiktoken';
 *
 * estimateCost({
 *   prompt: greet, vars: { name: 'A' }, model: 'gpt-4o',
 *   tokenizer: tiktokenFor('gpt-4o'),
 * });
 */
export function tiktokenFor(model: string): TokenizerFn {
  let encoder: { encode: (text: string) => number[] };
  let encodingName: string;

  const overrideName = ENCODING_OVERRIDES[model];
  try {
    if (overrideName) {
      encoder = getEncoding(
        overrideName as Parameters<typeof getEncoding>[0],
      );
      encodingName = `tiktoken/${overrideName}`;
    } else {
      encoder = encodingForModel(
        model as Parameters<typeof encodingForModel>[0],
      );
      encodingName = `tiktoken/${model}`;
    }
  } catch {
    if (!warnedOnFallback) {
      warnedOnFallback = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[@aikit/prompts] tiktokenFor('${model}') — model not recognized, ` +
          `falling back to cl100k_base.`,
      );
    }
    try {
      encoder = getEncoding('cl100k_base');
    } catch (cause) {
      throw new CostError(
        'COST_UNKNOWN_MODEL',
        `tiktokenFor('${model}') failed to load 'cl100k_base' fallback encoder.`,
        { model, cause },
      );
    }
    encodingName = 'tiktoken/cl100k_base (fallback)';
  }

  const tokenizer: TokenizerFn = Object.assign(
    (text: string): number => encoder.encode(text).length,
    {
      id: encodingName,
      accuracy: 'exact' as const,
    },
  );

  return tokenizer;
}
