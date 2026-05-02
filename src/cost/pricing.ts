import type { ModelPricing } from './types.js';

/**
 * Date stamp on the built-in pricing snapshot. Bumping prices bumps
 * this constant so callers can attribute estimates to a known fixture.
 */
export const PRICING_DATE = '2026-04-27' as const;

/**
 * Frozen built-in per-model price table. Snapshot taken on
 * `PRICING_DATE`; callers needing live pricing should call
 * `registerModel(...)` to override entries.
 *
 * Prices are exact at the snapshot date, sourced from each provider's
 * public pricing page. Cached-input discounts (`cachedInputUSDPer1M`)
 * are filled in for providers that publicly publish a discount.
 */
export const BUILTIN_PRICING: Readonly<Record<string, ModelPricing>> =
  Object.freeze({
    'gpt-4o': Object.freeze({
      inputUSDPer1M: 2.5,
      outputUSDPer1M: 10,
      cachedInputUSDPer1M: 1.25,
      imageBaseTokens: 765,
    }),
    'gpt-4o-mini': Object.freeze({
      inputUSDPer1M: 0.15,
      outputUSDPer1M: 0.6,
      cachedInputUSDPer1M: 0.075,
    }),
    'gpt-4-turbo': Object.freeze({
      inputUSDPer1M: 10,
      outputUSDPer1M: 30,
    }),
    'o1': Object.freeze({
      inputUSDPer1M: 15,
      outputUSDPer1M: 60,
    }),
    'o1-mini': Object.freeze({
      inputUSDPer1M: 3,
      outputUSDPer1M: 12,
    }),
    'claude-3-5-sonnet-latest': Object.freeze({
      inputUSDPer1M: 3,
      outputUSDPer1M: 15,
      cachedInputUSDPer1M: 0.3,
    }),
    'claude-3-5-haiku-latest': Object.freeze({
      inputUSDPer1M: 0.8,
      outputUSDPer1M: 4,
      cachedInputUSDPer1M: 0.08,
    }),
    'claude-3-opus-latest': Object.freeze({
      inputUSDPer1M: 15,
      outputUSDPer1M: 75,
      cachedInputUSDPer1M: 1.5,
    }),
    'gemini-1.5-pro': Object.freeze({
      inputUSDPer1M: 1.25,
      outputUSDPer1M: 5,
    }),
    'gemini-1.5-flash': Object.freeze({
      inputUSDPer1M: 0.075,
      outputUSDPer1M: 0.3,
    }),
  });
