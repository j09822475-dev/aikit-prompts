import { fnv1a32 } from '../internal/hash.js';

export { fnv1a32 };

/**
 * Deterministic bucket in `[0, 1)` derived from a hash. Used by
 * A/B-assignment math to project a hashed identifier onto the
 * weight-bucket interval.
 *
 * @param input String to hash and bucket.
 * @returns A value in `[0, 1)`.
 */
export const bucketize = (input: string): number =>
  fnv1a32(input) / 0x100000000;
