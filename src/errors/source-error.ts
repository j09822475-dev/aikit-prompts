import { PromptError, type ErrorCode } from './base.js';

type SourceErrorCode =
  | 'SOURCE_LOAD_FAILED'
  | 'SOURCE_PARSE_FAILED'
  | 'SOURCE_FS_UNAVAILABLE'
  | 'SOURCE_INTEGRITY_FAILED';

/**
 * Thrown — or surfaced as a `'change'` event of `type: 'error'` — by
 * hot-reload sources on network, parsing, runtime-availability, or
 * integrity-verification failures. Carries `cause` for wrapped errors.
 *
 * @property code       One of `'SOURCE_LOAD_FAILED' | 'SOURCE_PARSE_FAILED' | 'SOURCE_FS_UNAVAILABLE' | 'SOURCE_INTEGRITY_FAILED'`.
 * @property sourceName Stable name of the source that failed (`PromptSource.name`).
 * @property url        URL involved in the failure (HTTP source).
 */
export class SourceError extends PromptError {
  override readonly code: SourceErrorCode;
  readonly sourceName?: string;
  readonly url?: string;

  /**
   * @param code    Which source failure occurred.
   * @param message Human-readable explanation.
   * @param details Optional `{ sourceName, url, cause }` for diagnostics.
   */
  constructor(
    code: SourceErrorCode,
    message: string,
    details?: { sourceName?: string; url?: string; cause?: unknown },
  ) {
    super(PromptError.withDocs(code as ErrorCode, message), {
      ...(details?.cause !== undefined ? { cause: details.cause } : {}),
    });
    this.code = code;
    if (details?.sourceName !== undefined) this.sourceName = details.sourceName;
    if (details?.url !== undefined) this.url = details.url;
  }
}
