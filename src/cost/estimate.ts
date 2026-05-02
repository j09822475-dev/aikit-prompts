import { CostError } from '../errors/cost-error.js';
import type { ChatMessage } from '../types/message.js';
import { getPricing } from './pricing-registry.js';
import { PRICING_DATE } from './pricing.js';
import { heuristicTokenizer } from './tokenizer.js';
import type {
  CostEstimate,
  EstimateCostArgs,
  EstimateTokensArgs,
  TokenEstimate,
  TokenizerFn,
} from './types.js';

const PER_MESSAGE_OVERHEAD = 4;

const renderToChunks = <TVars extends Record<string, unknown>>(
  args: { prompt: { render: (vars: TVars) => unknown }; vars: TVars },
): { texts: string[]; imageCount: number } => {
  const result = args.prompt.render(args.vars);
  if (typeof result === 'string') return { texts: [result], imageCount: 0 };

  const texts: string[] = [];
  let imageCount = 0;
  if (Array.isArray(result)) {
    for (const m of result as readonly ChatMessage[]) {
      if (typeof m.content === 'string') {
        texts.push(m.content);
      } else {
        for (const part of m.content) {
          if (part.type === 'text') texts.push(part.text);
          else if (part.type === 'image') imageCount++;
        }
      }
    }
  }
  return { texts, imageCount };
};

const validateTokenCount = (count: number, model: string): number => {
  if (
    typeof count !== 'number' ||
    !Number.isFinite(count) ||
    count < 0
  ) {
    throw new CostError(
      'COST_INVALID_TOKEN_COUNT',
      `Tokenizer returned invalid count: ${count}`,
      { model },
    );
  }
  return count;
};

const countTokens = (
  texts: readonly string[],
  imageCount: number,
  imageBaseTokens: number,
  tokenizer: TokenizerFn,
  model: string,
): number => {
  let total = 0;
  for (const text of texts) {
    if (text.length === 0) continue;
    let count: number;
    try {
      count = tokenizer(text, model);
    } catch (cause) {
      throw new CostError(
        'COST_INVALID_TOKEN_COUNT',
        `Tokenizer threw for model '${model}'`,
        { model, cause },
      );
    }
    total += validateTokenCount(count, model);
    total += PER_MESSAGE_OVERHEAD;
  }
  total += imageCount * imageBaseTokens;
  return total;
};

/**
 * Estimate input/output token counts and dollar cost for a `(prompt,
 * vars, model)` tuple. Generic in `TVars` so the `vars` argument is
 * type-checked against the prompt's input shape — no
 * `Record<string, unknown>` widening.
 *
 * @param args.prompt              The `PromptDefinition` or `Composition`.
 * @param args.vars                Required-keys input for `prompt`.
 * @param args.model               Model id (matched against the pricing registry).
 * @param args.expectedOutputTokens Optional expected output (default: 0 — input cost only).
 * @param args.tokenizer           Optional tokenizer (default: 4-chars-per-token heuristic).
 * @returns A `CostEstimate` with token counts, dollar costs, and accuracy tag.
 *
 * @throws {CostError}     when the model is unknown or a tokenizer returns garbage.
 * @throws {VariableError} when `args.vars` is missing required keys.
 *
 * @example
 * estimateCost({
 *   prompt: greet, vars: { name: 'Alice' }, model: 'gpt-4o',
 *   expectedOutputTokens: 200,
 * });
 */
export function estimateCost<TVars extends Record<string, unknown>>(
  args: EstimateCostArgs<TVars>,
): CostEstimate {
  const pricing = getPricing(args.model);
  const tokenizer = args.tokenizer ?? heuristicTokenizer;
  const expectedOutputTokens = args.expectedOutputTokens ?? 0;
  if (
    typeof expectedOutputTokens !== 'number' ||
    expectedOutputTokens < 0 ||
    !Number.isFinite(expectedOutputTokens)
  ) {
    throw new CostError(
      'COST_INVALID_TOKEN_COUNT',
      `Invalid expectedOutputTokens: ${expectedOutputTokens}`,
      { model: args.model },
    );
  }

  const { texts, imageCount } = renderToChunks(args);
  const inputTokens = countTokens(
    texts,
    imageCount,
    pricing.imageBaseTokens ?? 0,
    tokenizer,
    args.model,
  );

  const inputCostUSD =
    (inputTokens / 1_000_000) * pricing.inputUSDPer1M;
  const outputCostUSD =
    (expectedOutputTokens / 1_000_000) * pricing.outputUSDPer1M;
  return Object.freeze({
    inputTokens,
    outputTokens: expectedOutputTokens,
    inputCostUSD,
    outputCostUSD,
    totalUSD: inputCostUSD + outputCostUSD,
    currency: 'USD' as const,
    model: args.model,
    pricingDate: PRICING_DATE,
    tokenizer: tokenizer.id ?? 'unknown',
    accuracy: tokenizer.accuracy ?? 'rough',
  });
}

/**
 * Alias of `estimateCost`. Re-exported under a name that signals
 * "rough" at the call site for callers who want the explicit cue.
 */
export const roughCost = estimateCost;

/**
 * Tokens-only counterpart. Same generic, no pricing/model required.
 *
 * @param args.prompt    The `PromptDefinition` or `Composition`.
 * @param args.vars      Required-keys input for `prompt`.
 * @param args.tokenizer Optional tokenizer (default: 4-chars-per-token heuristic).
 * @returns Token count and accuracy tag.
 *
 * @throws {VariableError} when `args.vars` is missing required keys.
 */
export function estimateTokens<TVars extends Record<string, unknown>>(
  args: EstimateTokensArgs<TVars>,
): TokenEstimate {
  const tokenizer = args.tokenizer ?? heuristicTokenizer;
  const { texts, imageCount } = renderToChunks(args);
  const inputTokens = countTokens(
    texts,
    imageCount,
    0,
    tokenizer,
    'tokens-only',
  );
  return Object.freeze({
    inputTokens,
    tokenizer: tokenizer.id ?? 'unknown',
    accuracy: tokenizer.accuracy ?? 'rough',
  });
}
