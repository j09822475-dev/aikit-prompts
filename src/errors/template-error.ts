import { PromptError, type ErrorCode } from './base.js';

type TemplateErrorCode =
  | 'TEMPLATE_PARSE'
  | 'TEMPLATE_UNCLOSED_TAG'
  | 'TEMPLATE_UNKNOWN_DIRECTIVE';

/**
 * Thrown when the parser cannot turn a template string into an AST
 * (mismatched braces, unknown directive, malformed token).
 *
 * @property code     One of `'TEMPLATE_PARSE' | 'TEMPLATE_UNCLOSED_TAG' | 'TEMPLATE_UNKNOWN_DIRECTIVE'`.
 * @property position Optional 0-based character offset into the source template where parsing failed.
 * @property snippet  Optional ~40-char window around `position` for diagnostic display.
 */
export class TemplateError extends PromptError {
  override readonly code: TemplateErrorCode;
  readonly position?: number;
  readonly snippet?: string;

  /**
   * @param code     Which template-parser failure occurred.
   * @param message  Human-readable explanation of the failure.
   * @param details  Optional `{ position, snippet }` for diagnostics.
   */
  constructor(
    code: TemplateErrorCode,
    message: string,
    details?: { position?: number; snippet?: string },
  ) {
    super(PromptError.withDocs(code as ErrorCode, message));
    this.code = code;
    if (details?.position !== undefined) this.position = details.position;
    if (details?.snippet !== undefined) this.snippet = details.snippet;
  }
}
