import { InvariantError } from '../errors/misc-errors.js';

/**
 * Assert that a condition is truthy, narrowing the surrounding code via
 * the `asserts` clause. On failure throws `InvariantError` (`code:
 * 'INVARIANT'`) — these are bug-grade errors that indicate a logic
 * mistake in the library, not user input.
 *
 * @param condition The expression to assert.
 * @param message   Human-readable description of what is being asserted.
 *
 * @throws {InvariantError} when `condition` is falsy.
 *
 * @example
 * invariant(node.type === 'var', 'expected a var node here');
 */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new InvariantError(message);
}
