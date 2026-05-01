import { PromptError, type ErrorCode } from './base.js';

type VersionErrorCode =
  | 'VERSION_INVALID'
  | 'VERSION_NOT_FOUND'
  | 'VERSION_RANGE_INVALID';

/**
 * Thrown by SemVer parsing, range matching, and registry lookup.
 *
 * @property code     One of `'VERSION_INVALID' | 'VERSION_NOT_FOUND' | 'VERSION_RANGE_INVALID'`.
 * @property id       Optional prompt id involved in the failure.
 * @property selector The version string / range that triggered the error.
 */
export class VersionError extends PromptError {
  override readonly code: VersionErrorCode;
  readonly id?: string;
  readonly selector?: string;

  /**
   * @param code     Which version failure occurred.
   * @param message  Human-readable explanation.
   * @param details  Optional `{ id, selector }` for diagnostic context.
   */
  constructor(
    code: VersionErrorCode,
    message: string,
    details?: { id?: string; selector?: string },
  ) {
    super(PromptError.withDocs(code as ErrorCode, message));
    this.code = code;
    if (details?.id !== undefined) this.id = details.id;
    if (details?.selector !== undefined) this.selector = details.selector;
  }
}
