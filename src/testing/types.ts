import type { PromptDefinition } from '../core/types.js';

/** Loose context object supplied at assignment time. */
export interface AssignmentContext {
  readonly userId?: string;
  readonly sessionId?: string;
  readonly [key: string]: unknown;
}

/** Single A/B variant. All variants in a test share the same `TVars`. */
export interface VariantDefinition<
  TId extends string,
  TVars extends Record<string, unknown>,
> {
  readonly id: TId;
  readonly prompt: PromptDefinition<TVars>;
  /** Numeric weight in `(0, 100]`. Sum across variants must be `<= 100`. */
  readonly weight: number;
}

/**
 * Assignment result. Discriminated on `kind` (not on `id`) so that
 * user-supplied variant ids — including `'holdout'` or `'unassigned'`
 * — never collide with the special cases.
 */
export type Assignment<
  TVariantId extends string,
  TVars extends Record<string, unknown>,
> =
  | {
      readonly kind: 'variant';
      readonly id: TVariantId;
      readonly prompt: PromptDefinition<TVars>;
      readonly bucket: number;
    }
  | { readonly kind: 'holdout'; readonly bucket: number }
  | {
      readonly kind: 'unassigned';
      readonly bucket: -1;
      readonly reason: 'no-identifier' | 'identifier-threw';
      readonly cause?: unknown;
    };

/** Pure function returning the identifier string used for bucketing. */
export type IdentifierFn = (ctx: AssignmentContext) => string | undefined;

/** Options accepted by `createABTest({ ... })`. */
export interface ABTestOptions<
  TVars extends Record<string, unknown>,
  TVariants extends ReadonlyArray<VariantDefinition<string, TVars>>,
> {
  /** Stable name; mixed into the hash so two tests segment independently. */
  readonly name: string;
  /** Variant definitions. Weights must sum to `<= 100`. All share `TVars`. */
  readonly variants: TVariants;
  /** Pure function returning the bucketing identifier. */
  readonly identifier: IdentifierFn;
  /** Fraction in `[0, 1]` excluded from the test entirely. */
  readonly holdout?: number;
  /** Optional override for the hash function (default: FNV-1a 32). */
  readonly hash?: (input: string) => number;
}

/** Compiled A/B test instance. */
export interface ABTest<
  TVars extends Record<string, unknown>,
  TVariantId extends string,
> {
  readonly name: string;
  /**
   * Compute the variant assignment for a context. Pure function — same
   * `(name, identifier)` pair always returns the same variant.
   *
   * @param ctx Assignment context (must include the identifier source).
   */
  assign(ctx: AssignmentContext): Assignment<TVariantId, TVars>;
  /**
   * Pure preview helper: return the deterministic bucket `[0, 1)` for
   * the identifier. Useful for previewing the bucket distribution
   * without committing to a variant.
   *
   * @param ctx Assignment context.
   */
  bucket(ctx: AssignmentContext): number;
}
