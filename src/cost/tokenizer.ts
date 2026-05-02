import type { TokenizerFn } from './types.js';

/**
 * Heuristic tokenizer: `Math.ceil(text.length / 4)`. Roughly correct
 * for English (~10% under), wrong for CJK (up to ~50% over).
 *
 * Use `tiktokenFor(model)` from `@aikit/prompts/cost/tiktoken` for
 * production-accurate counts.
 *
 * @returns A `TokenizerFn` tagged `id: 'heuristic-4cpt', accuracy: 'rough'`.
 */
export const heuristicTokenizer: TokenizerFn = Object.assign(
  (text: string): number => {
    if (text.length === 0) return 0;
    return Math.ceil(text.length / 4);
  },
  {
    id: 'heuristic-4cpt',
    accuracy: 'rough' as const,
  },
);
