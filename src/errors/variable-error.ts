import { PromptError, type ErrorCode } from './base.js';

type VariableErrorCode =
  | 'VARIABLE_MISSING'
  | 'VARIABLE_TYPE_MISMATCH'
  | 'VARIABLE_VALIDATION_FAILED';

/**
 * Thrown when `render()` cannot turn the supplied `vars` into a string —
 * a required variable is absent, has the wrong shape (function, Symbol,
 * class instance, circular object), or the user's `validate()` callback
 * returned a non-empty list of errors.
 *
 * @property code              One of `'VARIABLE_MISSING' | 'VARIABLE_TYPE_MISMATCH' | 'VARIABLE_VALIDATION_FAILED'`.
 * @property missing           Variable names whose values were not supplied (`VARIABLE_MISSING`).
 * @property invalid           Variable name whose value had an unsupported type (`VARIABLE_TYPE_MISMATCH`).
 * @property validationErrors  Messages returned by the user's `validate()` callback (`VARIABLE_VALIDATION_FAILED`).
 * @property templateId        Optional id of the prompt that failed, for log context.
 */
export class VariableError extends PromptError {
  override readonly code: VariableErrorCode;
  readonly missing: readonly string[];
  readonly invalid?: string;
  readonly validationErrors?: readonly string[];
  readonly templateId?: string;

  /**
   * @param code     Which variable failure occurred.
   * @param message  Human-readable explanation.
   * @param details  Structured context (missing keys, validation messages, etc.).
   */
  constructor(
    code: VariableErrorCode,
    message: string,
    details?: {
      missing?: readonly string[];
      invalid?: string;
      validationErrors?: readonly string[];
      templateId?: string;
      cause?: unknown;
    },
  ) {
    super(PromptError.withDocs(code as ErrorCode, message), {
      ...(details?.cause !== undefined ? { cause: details.cause } : {}),
    });
    this.code = code;
    this.missing = details?.missing ?? [];
    if (details?.invalid !== undefined) this.invalid = details.invalid;
    if (details?.validationErrors !== undefined)
      this.validationErrors = details.validationErrors;
    if (details?.templateId !== undefined) this.templateId = details.templateId;
  }

  /**
   * Convenience constructor for the most common shape: a list of missing
   * required variable names.
   *
   * @param missing    Variable names that were not supplied.
   * @param templateId Optional prompt id for diagnostic context.
   * @returns A `VariableError` with code `'VARIABLE_MISSING'`.
   */
  static missing(
    missing: readonly string[],
    templateId?: string,
  ): VariableError {
    return new VariableError(
      'VARIABLE_MISSING',
      `Missing required template variables: ${missing.join(', ')}`,
      templateId !== undefined ? { missing, templateId } : { missing },
    );
  }
}
