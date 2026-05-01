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

interface JsTiktokenModule {
  encodingForModel?: (model: string) => {
    encode: (text: string) => number[];
  };
  getEncoding?: (name: string) => { encode: (text: string) => number[] };
}

let cachedModule: JsTiktokenModule | undefined;

const loadModule = async (): Promise<JsTiktokenModule> => {
  if (cachedModule) return cachedModule;
  try {
    cachedModule = (await import(
      'js-tiktoken'
    )) as JsTiktokenModule;
    return cachedModule;
  } catch (cause) {
    throw new CostError(
      'COST_UNKNOWN_MODEL',
      `tiktokenFor() requires the 'js-tiktoken' package — install it as a peer dependency.`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ...(cause !== undefined ? { cause } : {}) } as any,
    );
  }
};

/**
 * Build a `TokenizerFn` backed by `js-tiktoken` for the given model.
 *
 * The first invocation lazy-loads `js-tiktoken` (peer dependency); the
 * encoding is cached for subsequent calls. Unknown models fall back to
 * `cl100k_base` with a one-time `console.warn` and a tagged accuracy
 * id (`'tiktoken/cl100k_base (fallback)'`) so the caller can detect
 * the fallback at the value level.
 *
 * @param model Model id (e.g. `'gpt-4o'`).
 * @returns A `TokenizerFn` accepted by `estimateCost({ tokenizer })`.
 *
 * @throws {CostError} (`code: 'COST_UNKNOWN_MODEL'`) when `js-tiktoken` cannot be loaded.
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
  let encoderPromise: Promise<{
    encode: (text: string) => number[];
    isFallback: boolean;
    encodingName: string;
  }> | undefined;

  const ensureEncoder = (): Promise<{
    encode: (text: string) => number[];
    isFallback: boolean;
    encodingName: string;
  }> => {
    if (encoderPromise) return encoderPromise;
    encoderPromise = loadModule().then((mod) => {
      const overrideName = ENCODING_OVERRIDES[model];
      if (overrideName && mod.getEncoding) {
        return {
          encode: mod.getEncoding(overrideName).encode,
          isFallback: false,
          encodingName: `tiktoken/${overrideName}`,
        };
      }
      try {
        if (mod.encodingForModel) {
          return {
            encode: mod.encodingForModel(model).encode,
            isFallback: false,
            encodingName: `tiktoken/${model}`,
          };
        }
      } catch {
        /* fall through to cl100k_base */
      }
      if (!warnedOnFallback) {
        warnedOnFallback = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[@aikit/prompts] tiktokenFor('${model}') — model not recognized, ` +
            `falling back to cl100k_base.`,
        );
      }
      if (!mod.getEncoding) {
        throw new CostError(
          'COST_UNKNOWN_MODEL',
          `js-tiktoken does not expose getEncoding; cannot fall back for '${model}'`,
          { model },
        );
      }
      return {
        encode: mod.getEncoding('cl100k_base').encode,
        isFallback: true,
        encodingName: 'tiktoken/cl100k_base (fallback)',
      };
    });
    return encoderPromise;
  };

  let resolved:
    | { encode: (text: string) => number[]; encodingName: string }
    | undefined;

  const tokenizer: TokenizerFn = Object.assign(
    (text: string): number => {
      if (!resolved) {
        throw new CostError(
          'COST_UNKNOWN_MODEL',
          `tiktokenFor('${model}') has not been awaited yet — ` +
            `await tokenizer.ready() before passing it to estimateCost.`,
          { model },
        );
      }
      return resolved.encode(text).length;
    },
    {
      id: `tiktoken/${model}`,
      accuracy: 'exact' as const,
    },
  );

  Object.assign(tokenizer, {
    /**
     * Eagerly resolve the underlying encoder. Call this once before
     * passing the tokenizer to `estimateCost` to avoid the synchronous
     * `tiktokenFor()` call hitting the not-yet-loaded path.
     */
    ready: async (): Promise<TokenizerFn> => {
      const e = await ensureEncoder();
      resolved = { encode: e.encode, encodingName: e.encodingName };
      Object.assign(tokenizer, { id: e.encodingName });
      return tokenizer;
    },
  });

  return tokenizer;
}
