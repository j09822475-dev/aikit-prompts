/**
 * Literal union of every error code emitted by the library. Subclasses of
 * `PromptError` populate the `code` field with one of these values, and
 * callers can switch on `error.code` exhaustively.
 */
export type ErrorCode =
  | 'INVARIANT'
  | 'TEMPLATE_PARSE'
  | 'TEMPLATE_UNCLOSED_TAG'
  | 'TEMPLATE_UNKNOWN_DIRECTIVE'
  | 'VARIABLE_MISSING'
  | 'VARIABLE_TYPE_MISMATCH'
  | 'VARIABLE_VALIDATION_FAILED'
  | 'VERSION_INVALID'
  | 'VERSION_NOT_FOUND'
  | 'VERSION_RANGE_INVALID'
  | 'AB_TEST_INVALID_WEIGHTS'
  | 'AB_TEST_DUPLICATE_VARIANT'
  | 'AB_TEST_NO_IDENTIFIER'
  | 'COST_UNKNOWN_MODEL'
  | 'COST_INVALID_TOKEN_COUNT'
  | 'SOURCE_LOAD_FAILED'
  | 'SOURCE_PARSE_FAILED'
  | 'SOURCE_FS_UNAVAILABLE'
  | 'SOURCE_INTEGRITY_FAILED'
  | 'REGISTRY_DUPLICATE'
  | 'BUILDER_FROZEN'
  | 'TOOL_INVALID_SCHEMA'
  | 'CACHE_BREAKPOINT_LIMIT';

/**
 * Edge-safe production check. Cloudflare Workers and Vercel Edge throw
 * `ReferenceError` on bare `process.env` access; we gate every read on
 * `typeof` checks. Also tolerates Deno (`Deno.env`) and the browser.
 */
const isProduction = (): boolean => {
  try {
    return (
      typeof process !== 'undefined' &&
      typeof process.env !== 'undefined' &&
      process.env['NODE_ENV'] === 'production'
    );
  } catch {
    return false;
  }
};

const DOCS_BASE =
  'https://github.com/j09822475-dev/aikit-prompts/blob/main/docs/errors.md';

const docsLink = (code: ErrorCode): string =>
  isProduction() ? '' : ` (see ${DOCS_BASE}#${code.toLowerCase()})`;

/**
 * Abstract root of the library's error hierarchy. Every thrown error in
 * `@aikit/prompts` extends this class, so user code can write a single
 * `catch (e) { if (e instanceof PromptError) ... }` and exhaustively
 * switch on `e.code` for finer-grained handling.
 *
 * @example
 * try {
 *   greet.render({});
 * } catch (e) {
 *   if (e instanceof PromptError && e.code === 'VARIABLE_MISSING') {
 *     // ...
 *   }
 * }
 */
export abstract class PromptError extends Error {
  abstract readonly code: ErrorCode;
  override readonly name: string = 'PromptError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Format `message` with an appended docs link when not running in
   * production. Subclass constructors should call this rather than
   * concatenating the link manually.
   *
   * @param code The error code that will be assigned to `this.code`.
   * @param message Human-readable error message.
   * @returns The same message in production, or `message + docs link` in dev.
   */
  protected static withDocs(code: ErrorCode, message: string): string {
    return `${message}${docsLink(code)}`;
  }
}
