/**
 * Structural deep-equality for plain JSON-shaped values. Handles
 * primitives, arrays, and plain objects. Function and Symbol values are
 * compared by reference (sufficient for the dedup paths in the
 * registry).
 *
 * Does **not** handle Map/Set/Date/RegExp (the registry only sees
 * JSON-serialized prompt definitions).
 *
 * @param a First value.
 * @param b Second value.
 * @returns `true` when `a` and `b` are structurally equal.
 *
 * @example
 * deepEqual({ x: 1 }, { x: 1 }); // true
 * deepEqual([1, 2], [1, 3]);    // false
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(b)) return false;

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;

  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (
      !deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      )
    ) {
      return false;
    }
  }

  return true;
}
