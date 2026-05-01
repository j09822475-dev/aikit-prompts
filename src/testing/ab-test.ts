import type { PromptDefinition } from '../core/types.js';
import { fnv1a32 } from '../internal/hash.js';
import { buildAllocation, pickVariant } from './allocation.js';
import type {
  ABTest,
  ABTestOptions,
  Assignment,
  AssignmentContext,
  VariantDefinition,
} from './types.js';

/**
 * Create a deterministic A/B (or A/B/C/...) split test over multiple
 * prompt variants. **All variants must share the same input shape
 * `TVars`** — enforced at the type level so an A/B with mismatched
 * required vars cannot compile. This is the worst class of A/B bug
 * and is statically excluded.
 *
 * Assignment is computed client-side via FNV-1a hashing of the
 * identifier, so the same identifier always lands on the same variant
 * — no network round-trip, no shared store, edge-runtime safe.
 *
 * @param options Test configuration: `name`, `variants`, `identifier`,
 *                optional `holdout` and `hash` overrides.
 * @returns An `ABTest` exposing `assign(ctx)` and `bucket(ctx)`.
 *
 * @throws {ABTestError} on duplicate variant ids, invalid weights, or
 *   invalid holdout.
 *
 * @example
 * const test = createABTest({
 *   name: 'search-prompt-2026-q2',
 *   variants: [
 *     { id: 'control', prompt: v1, weight: 50 },
 *     { id: 'rephrased', prompt: v2, weight: 50 },
 *   ],
 *   identifier: (ctx) => ctx.userId ?? ctx.sessionId,
 *   holdout: 0.1,
 * });
 *
 * const a = test.assign({ userId: 'user-42' });
 * if (a.kind === 'variant') a.prompt.render({ query: 'TS' });
 */
export function createABTest<
  TVars extends Record<string, unknown>,
  const TVariants extends ReadonlyArray<VariantDefinition<string, TVars>>,
>(
  options: ABTestOptions<TVars, TVariants>,
): ABTest<TVars, TVariants[number]['id']> {
  const allocation = buildAllocation(
    options.variants,
    options.holdout ?? 0,
  );
  const hash = options.hash ?? fnv1a32;
  const promptsById = new Map<string, PromptDefinition<TVars>>();
  for (const v of options.variants) promptsById.set(v.id, v.prompt);

  const computeBucket = (ctx: AssignmentContext): number | undefined => {
    let id: string | undefined;
    try {
      id = options.identifier(ctx);
    } catch {
      return undefined;
    }
    if (id === undefined || id === null || id === '') return undefined;
    const value = hash(`${options.name}::${id}`) >>> 0;
    return value / 0x100000000;
  };

  return Object.freeze({
    name: options.name,

    assign(
      ctx: AssignmentContext,
    ): Assignment<TVariants[number]['id'], TVars> {
      let id: string | undefined;
      try {
        id = options.identifier(ctx);
      } catch (cause) {
        return {
          kind: 'unassigned',
          bucket: -1,
          reason: 'identifier-threw',
          cause,
        };
      }
      if (id === undefined || id === null || id === '') {
        return { kind: 'unassigned', bucket: -1, reason: 'no-identifier' };
      }
      const bucket = (hash(`${options.name}::${id}`) >>> 0) / 0x100000000;
      if (
        options.holdout !== undefined &&
        options.holdout > 0 &&
        bucket < options.holdout
      ) {
        return { kind: 'holdout', bucket };
      }
      const variantId = pickVariant(bucket, allocation);
      if (variantId === undefined) {
        return { kind: 'holdout', bucket };
      }
      const prompt = promptsById.get(variantId);
      if (!prompt) {
        return { kind: 'holdout', bucket };
      }
      return {
        kind: 'variant',
        id: variantId as TVariants[number]['id'],
        prompt,
        bucket,
      };
    },

    bucket(ctx: AssignmentContext): number {
      const value = computeBucket(ctx);
      return value ?? -1;
    },
  });
}
