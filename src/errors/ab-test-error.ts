import { PromptError, type ErrorCode } from './base.js';

type ABTestErrorCode =
  | 'AB_TEST_INVALID_WEIGHTS'
  | 'AB_TEST_DUPLICATE_VARIANT'
  | 'AB_TEST_NO_IDENTIFIER';

/**
 * Thrown when an A/B test is misconfigured at construction time.
 * Runtime "no identifier" cases surface in the `Assignment` value rather
 * than throwing — this class is reserved for genuine programmer errors.
 *
 * @property code           One of `'AB_TEST_INVALID_WEIGHTS' | 'AB_TEST_DUPLICATE_VARIANT' | 'AB_TEST_NO_IDENTIFIER'`.
 * @property duplicateId    Variant id that appeared more than once (`AB_TEST_DUPLICATE_VARIANT`).
 * @property weightSum      Total of supplied weights when invalid (`AB_TEST_INVALID_WEIGHTS`).
 */
export class ABTestError extends PromptError {
  override readonly code: ABTestErrorCode;
  readonly duplicateId?: string;
  readonly weightSum?: number;

  /**
   * @param code    Which A/B configuration failure occurred.
   * @param message Human-readable explanation.
   * @param details Optional structured context.
   */
  constructor(
    code: ABTestErrorCode,
    message: string,
    details?: { duplicateId?: string; weightSum?: number },
  ) {
    super(PromptError.withDocs(code as ErrorCode, message));
    this.code = code;
    if (details?.duplicateId !== undefined)
      this.duplicateId = details.duplicateId;
    if (details?.weightSum !== undefined) this.weightSum = details.weightSum;
  }
}
