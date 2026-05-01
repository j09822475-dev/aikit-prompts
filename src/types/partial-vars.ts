/**
 * After `.partial({ a: 1 })`, the remaining required input is
 * `Omit<TInput, 'a'>`. Builders track partial keys as a union and apply
 * this on `.build()` so `.render()` only asks for what is still missing.
 */
export type RemainingInput<
  TInput,
  TPartialKeys extends keyof TInput,
> = Omit<TInput, TPartialKeys>;

/**
 * Convert a union of object types into their intersection. Used by
 * `compose([...])` so the resulting `Composition`'s `TVars` is the
 * intersection of every block's input shape.
 */
export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;
