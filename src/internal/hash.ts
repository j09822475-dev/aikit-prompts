/**
 * FNV-1a 32-bit hash. Deterministic, fast, dependency-free. Lives in
 * `internal/` so any layer (testing, adapters, sources) can use it
 * without a cross-layer import.
 *
 * @param input UTF-8 string to hash.
 * @returns A 32-bit unsigned integer.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
