/**
 * FNV-1a 32-bit hash. Deterministic, fast, dependency-free. Lives in
 * `internal/` so any layer (testing, adapters, sources) can use it
 * without a cross-layer import.
 *
 * Hashes JS string code units (UTF-16) — not UTF-8 bytes — so two
 * strings that are equal under `===` always produce the same hash, but
 * the value will differ from a "real" UTF-8 FNV-1a for inputs
 * containing non-ASCII characters. Stable for the in-process A/B
 * bucketing and dedup paths the library uses it for.
 *
 * @param input String to hash.
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
