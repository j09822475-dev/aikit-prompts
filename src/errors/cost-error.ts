import { PromptError, type ErrorCode } from './base.js';

type CostErrorCode = 'COST_UNKNOWN_MODEL' | 'COST_INVALID_TOKEN_COUNT';

/**
 * Thrown by the cost subsystem when a model is unknown or a tokenizer
 * returns a non-finite / negative count.
 *
 * @property code  One of `'COST_UNKNOWN_MODEL' | 'COST_INVALID_TOKEN_COUNT'`.
 * @property model The model id involved in the failure, when applicable.
 */
export class CostError extends PromptError {
  override readonly code: CostErrorCode;
  readonly model?: string;

  /**
   * @param code    Which cost-subsystem failure occurred.
   * @param message Human-readable explanation.
   * @param details Optional structured context.
   */
  constructor(
    code: CostErrorCode,
    message: string,
    details?: { model?: string; cause?: unknown },
  ) {
    super(
      PromptError.withDocs(code as ErrorCode, message),
      details?.cause !== undefined ? { cause: details.cause } : undefined,
    );
    this.code = code;
    if (details?.model !== undefined) this.model = details.model;
  }
}
