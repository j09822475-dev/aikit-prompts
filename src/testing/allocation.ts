import { ABTestError } from '../errors/ab-test-error.js';
import type { VariantDefinition } from './types.js';

/** Per-variant cumulative bucket boundary in `[0, 1)`. */
export interface AllocationBucket<TId extends string> {
  readonly id: TId;
  readonly upperBound: number;
}

/**
 * Validate variant weights and build an array of cumulative bucket
 * boundaries used by `assign()` to project a deterministic
 * `[0, 1)` value onto a variant.
 *
 * @param variants Variant definitions.
 * @param holdout  Fraction excluded from the experiment entirely (`[0, 1]`).
 * @returns An array of `{ id, upperBound }` cumulative buckets.
 *
 * @throws {ABTestError} on duplicate variant ids, invalid weights, or
 *   invalid holdout.
 */
export function buildAllocation<
  TId extends string,
  TVars extends Record<string, unknown>,
>(
  variants: ReadonlyArray<VariantDefinition<TId, TVars>>,
  holdout = 0,
): readonly AllocationBucket<TId>[] {
  if (variants.length === 0) {
    throw new ABTestError(
      'AB_TEST_INVALID_WEIGHTS',
      `createABTest requires at least one variant`,
    );
  }
  if (holdout < 0 || holdout > 1) {
    throw new ABTestError(
      'AB_TEST_INVALID_WEIGHTS',
      `holdout must be in [0, 1]; got ${holdout}`,
    );
  }

  const seen = new Set<string>();
  let total = 0;
  for (const v of variants) {
    if (seen.has(v.id)) {
      throw new ABTestError(
        'AB_TEST_DUPLICATE_VARIANT',
        `Duplicate variant id '${v.id}'`,
        { duplicateId: v.id },
      );
    }
    seen.add(v.id);
    if (
      typeof v.weight !== 'number' ||
      !Number.isFinite(v.weight) ||
      v.weight <= 0
    ) {
      throw new ABTestError(
        'AB_TEST_INVALID_WEIGHTS',
        `Variant '${v.id}' has invalid weight: ${v.weight}`,
      );
    }
    total += v.weight;
  }

  if (total <= 0 || total > 100) {
    throw new ABTestError(
      'AB_TEST_INVALID_WEIGHTS',
      `Variant weights must sum to a value in (0, 100]; got ${total}`,
      { weightSum: total },
    );
  }

  const inExperiment = 1 - holdout;
  const scale = inExperiment / 100;
  const out: AllocationBucket<TId>[] = [];
  let cumulative = holdout;
  for (const v of variants) {
    cumulative += v.weight * scale;
    out.push(Object.freeze({ id: v.id, upperBound: cumulative }));
  }
  if (out.length > 0) {
    const last = out[out.length - 1];
    if (last !== undefined) {
      out[out.length - 1] = Object.freeze({
        id: last.id,
        upperBound: 1,
      });
    }
  }
  return Object.freeze(out);
}

/**
 * Find the variant id whose bucket interval contains `value`. Walks the
 * cumulative-boundary array — O(N) where N is the number of variants.
 *
 * @param value      Bucket value in `[0, 1)`.
 * @param allocation Cumulative-boundary array from `buildAllocation`.
 * @returns The matching variant id, or `undefined` when `value < holdout`.
 */
export function pickVariant<TId extends string>(
  value: number,
  allocation: readonly AllocationBucket<TId>[],
): TId | undefined {
  for (const bucket of allocation) {
    if (value < bucket.upperBound) return bucket.id;
  }
  const last = allocation[allocation.length - 1];
  return last?.id;
}
