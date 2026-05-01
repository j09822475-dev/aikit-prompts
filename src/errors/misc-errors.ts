import { PromptError, type ErrorCode } from './base.js';

/**
 * Thrown when registering two prompts with the same `(id, version)`
 * pair without `{ replace: true }`. Hot-reload sources should pass
 * `replace: true` to avoid this.
 *
 * @property id      The prompt id.
 * @property version The duplicate version string.
 */
export class RegistryDuplicateError extends PromptError {
  override readonly code: ErrorCode = 'REGISTRY_DUPLICATE';
  readonly id: string;
  readonly version: string;

  /**
   * @param id      Prompt id.
   * @param version Version that already exists in the registry.
   */
  constructor(id: string, version: string) {
    super(
      PromptError.withDocs(
        'REGISTRY_DUPLICATE',
        `Prompt '${id}' already has version '${version}' registered. ` +
          `Pass { replace: true } to overwrite.`,
      ),
    );
    this.id = id;
    this.version = version;
  }
}

/**
 * Thrown when a builder method is invoked after `.build()` has frozen
 * the definition. Builders are one-shot — clone via `.toJSON()` and
 * reconstruct if you need a derived prompt.
 */
export class BuilderFrozenError extends PromptError {
  override readonly code: ErrorCode = 'BUILDER_FROZEN';

  /**
   * @param method Name of the builder method that was called after `.build()`.
   */
  constructor(method: string) {
    super(
      PromptError.withDocs(
        'BUILDER_FROZEN',
        `Cannot call .${method}() — builder has been frozen by .build().`,
      ),
    );
  }
}

/**
 * Thrown when a tool / function definition has an invalid JSON Schema
 * (non-object root, duplicate name in the same composition, etc.).
 *
 * @property toolName Tool name that triggered the failure.
 */
export class ToolSchemaError extends PromptError {
  override readonly code: ErrorCode = 'TOOL_INVALID_SCHEMA';
  readonly toolName?: string;

  /**
   * @param message  Human-readable explanation.
   * @param toolName Name of the offending tool, if known.
   */
  constructor(message: string, toolName?: string) {
    super(PromptError.withDocs('TOOL_INVALID_SCHEMA', message));
    if (toolName !== undefined) this.toolName = toolName;
  }
}

/**
 * Emitted as a one-time warning (and as a thrown error in strict mode)
 * when a composition declares more than 4 cache breakpoints. Anthropic's
 * prompt-caching API caps at 4 breakpoints per request; excess markers
 * collapse to the last 4.
 *
 * @property breakpointCount Number of breakpoints that were declared.
 */
export class CacheBreakpointLimitError extends PromptError {
  override readonly code: ErrorCode = 'CACHE_BREAKPOINT_LIMIT';
  readonly breakpointCount: number;

  /**
   * @param breakpointCount Number of breakpoints declared in the composition.
   */
  constructor(breakpointCount: number) {
    super(
      PromptError.withDocs(
        'CACHE_BREAKPOINT_LIMIT',
        `Composition declares ${breakpointCount} cache breakpoints; ` +
          `Anthropic supports at most 4. The last 4 will be honored.`,
      ),
    );
    this.breakpointCount = breakpointCount;
  }
}

/**
 * Thrown by the internal `invariant()` helper when a code path that
 * should be unreachable is reached. Always indicates a bug in the
 * library, not user error.
 */
export class InvariantError extends PromptError {
  override readonly code: ErrorCode = 'INVARIANT';

  /**
   * @param message Description of the invariant that was violated.
   */
  constructor(message: string) {
    super(PromptError.withDocs('INVARIANT', `Invariant violated: ${message}`));
  }
}
