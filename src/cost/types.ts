import type { PromptDefinition, Composition } from '../core/types.js';

/** Pricing entry for a single model. All prices are USD. */
export interface ModelPricing {
  /** Cost per 1M input tokens. */
  readonly inputUSDPer1M: number;
  /** Cost per 1M output tokens. */
  readonly outputUSDPer1M: number;
  /** Optional cost per 1M cached input tokens (prompt-caching discount). */
  readonly cachedInputUSDPer1M?: number;
  /** Optional flat token equivalent for an image content part. */
  readonly imageBaseTokens?: number;
}

/** Tokenizer function signature. Pure, model-aware. */
export type TokenizerFn = ((text: string, model: string) => number) & {
  /** Stable identifier (e.g. `'heuristic-4cpt'`, `'tiktoken/cl100k_base'`). */
  readonly id?: string;
  /** Quality tag — `'rough'` for the heuristic, `'exact'` for real tokenizers. */
  readonly accuracy?: 'rough' | 'exact';
};

/** Result of `estimateCost(...)`. */
export interface CostEstimate {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly inputCostUSD: number;
  readonly outputCostUSD: number;
  readonly totalUSD: number;
  readonly currency: 'USD';
  readonly model: string;
  readonly pricingDate: string;
  readonly tokenizer: string;
  readonly accuracy: 'rough' | 'exact';
}

/** Result of `estimateTokens(...)`. */
export interface TokenEstimate {
  readonly inputTokens: number;
  readonly tokenizer: string;
  readonly accuracy: 'rough' | 'exact';
}

/** Args object accepted by `estimateCost`. */
export interface EstimateCostArgs<TVars extends Record<string, unknown>> {
  readonly prompt: PromptDefinition<TVars> | Composition<TVars>;
  readonly vars: TVars;
  readonly model: string;
  readonly expectedOutputTokens?: number;
  readonly tokenizer?: TokenizerFn;
}

/** Args object accepted by `estimateTokens`. */
export interface EstimateTokensArgs<TVars extends Record<string, unknown>> {
  readonly prompt: PromptDefinition<TVars> | Composition<TVars>;
  readonly vars: TVars;
  readonly tokenizer?: TokenizerFn;
}
