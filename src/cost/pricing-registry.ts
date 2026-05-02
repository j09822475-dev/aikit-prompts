import { CostError } from '../errors/cost-error.js';
import { BUILTIN_PRICING } from './pricing.js';
import type { ModelPricing } from './types.js';

const customPricing = new Map<string, ModelPricing>();

const validatePricing = (model: string, pricing: ModelPricing): void => {
  const checkPositive = (
    value: number | undefined,
    field: string,
  ): void => {
    if (value === undefined) return;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new CostError(
        'COST_INVALID_TOKEN_COUNT',
        `Invalid pricing for '${model}': ${field}=${value}`,
        { model },
      );
    }
  };
  checkPositive(pricing.inputUSDPer1M, 'inputUSDPer1M');
  checkPositive(pricing.outputUSDPer1M, 'outputUSDPer1M');
  checkPositive(pricing.cachedInputUSDPer1M, 'cachedInputUSDPer1M');
  checkPositive(pricing.imageBaseTokens, 'imageBaseTokens');
};

/**
 * Register a pricing entry for a custom or private model. Overrides
 * the built-in table when both have an entry for `model`.
 *
 * @param model   Model identifier (matched verbatim against `args.model`).
 * @param pricing `{ inputUSDPer1M, outputUSDPer1M, cachedInputUSDPer1M? }`.
 *
 * @throws {CostError} (`code: 'COST_INVALID_TOKEN_COUNT'`) on negative or non-finite price.
 *
 * @example
 * registerModel('internal-llama-70b', {
 *   inputUSDPer1M: 0.5,
 *   outputUSDPer1M: 1.5,
 * });
 */
export function registerModel(model: string, pricing: ModelPricing): void {
  validatePricing(model, pricing);
  customPricing.set(model, Object.freeze({ ...pricing }));
}

/**
 * Remove a previously registered custom pricing entry.
 *
 * @param model Model identifier.
 * @returns `true` when an entry was removed; `false` when none existed.
 */
export const unregisterModel = (model: string): boolean =>
  customPricing.delete(model);

/**
 * List every model id known to the pricing registry — built-in plus
 * any registered overrides. Result order is unspecified.
 *
 * @returns Array of model id strings.
 */
export function listModels(): readonly string[] {
  const seen = new Set<string>(Object.keys(BUILTIN_PRICING));
  for (const k of customPricing.keys()) seen.add(k);
  return [...seen];
}

/**
 * Resolve the pricing entry for a model. Custom entries shadow the
 * built-in table when both define `model`.
 *
 * @param model Model identifier.
 * @returns The matching `ModelPricing`.
 *
 * @throws {CostError} (`code: 'COST_UNKNOWN_MODEL'`) when no entry exists.
 */
export function getPricing(model: string): ModelPricing {
  const custom = customPricing.get(model);
  if (custom) return custom;
  const builtin = BUILTIN_PRICING[model];
  if (builtin) return builtin;
  throw new CostError(
    'COST_UNKNOWN_MODEL',
    `No pricing registered for model '${model}'. ` +
      `Call registerModel('${model}', { inputUSDPer1M, outputUSDPer1M }) to add one.`,
    { model },
  );
}
