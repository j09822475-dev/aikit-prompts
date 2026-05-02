import type { AssignmentContext, IdentifierFn } from './types.js';

/**
 * Helper that prefers `userId` and falls back to `sessionId`. The
 * common sticky-bucketing strategy: logged-in users always land on the
 * same variant; anonymous traffic sticks per session.
 *
 * @returns An `IdentifierFn` suitable for `createABTest({ identifier })`.
 *
 * @example
 * createABTest({
 *   ...,
 *   identifier: stickyUserOrSession,
 * });
 */
export const stickyUserOrSession: IdentifierFn = (ctx) =>
  ctx.userId ?? ctx.sessionId;

/**
 * Build an identifier function that reads the bucketing key from a
 * specified context property.
 *
 * @param key Property name on `AssignmentContext` that holds the
 *            bucketing identifier.
 * @returns An `IdentifierFn` that pulls `ctx[key]` (cast to string).
 *
 * @example
 * createABTest({
 *   ...,
 *   identifier: identifierFromKey('accountId'),
 * });
 */
export const identifierFromKey =
  (key: string): IdentifierFn =>
  (ctx: AssignmentContext): string | undefined => {
    const value = ctx[key];
    return typeof value === 'string' ? value : undefined;
  };
