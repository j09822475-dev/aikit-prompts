/**
 * Discriminated union for predictable failures. Functions that return
 * `Result<T, E>` never throw for their declared error class — they
 * surface failure in the value channel so callers can switch on `r.ok`.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Type guard for the success branch of a `Result`.
 *
 * @param r The result to inspect.
 * @returns `true` when the result is `{ ok: true; value }`.
 *
 * @example
 * const r = greet.tryRender({ name: 'Alice' });
 * if (isOk(r)) console.log(r.value);
 */
export const isOk = <T, E>(
  r: Result<T, E>,
): r is { readonly ok: true; readonly value: T } => r.ok;

/**
 * Type guard for the failure branch of a `Result`.
 *
 * @param r The result to inspect.
 * @returns `true` when the result is `{ ok: false; error }`.
 *
 * @example
 * const r = greet.tryRender({});
 * if (isErr(r)) console.error(r.error.code);
 */
export const isErr = <T, E>(
  r: Result<T, E>,
): r is { readonly ok: false; readonly error: E } => !r.ok;

/**
 * Wrap a value in a successful `Result`. Useful when threading error-aware
 * code paths through plain function returns.
 *
 * @param value The value to wrap.
 */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/**
 * Wrap an error in a failed `Result`.
 *
 * @param error The error to wrap.
 */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
