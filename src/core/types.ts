import type { Role } from '../types/role.js';
import type { ChatMessage, MultimodalPart } from '../types/message.js';
import type { Result } from '../types/result.js';
import type { VariableError } from '../errors/variable-error.js';
import type { TemplateAst } from '../internal/ast.js';

export type { Role, ChatMessage, MultimodalPart };

/** Structural JSON Schema. We do not depend on a schema library. */
export type JSONSchema = Readonly<Record<string, unknown>>;

/** Render-time options shared by `PromptDefinition` and `Composition`. */
export interface RenderOptions {
  /** Default `'none'`. `'markdown'` escapes `*_~|>#`. `'json'` JSON-stringifies values. */
  readonly escape?: 'none' | 'markdown' | 'json';
  /** Strict mode (default `true`) throws on unknown variables in the input record. */
  readonly strict?: boolean;
}

/**
 * Immutable, frozen prompt definition produced by `prompt(...).build()`.
 *
 * `TVars` is the set of variables `.render()` requires after partial
 * application. `TVersion` is the SemVer string supplied via `.version()`,
 * or `undefined` if none was set.
 */
export interface PromptDefinition<
  TVars extends Record<string, unknown> = Record<string, unknown>,
  TVersion extends string | undefined = string | undefined,
> {
  readonly id: string;
  readonly version: TVersion;
  readonly template: string;
  readonly partial: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
  /** Compiled AST cached at build time so `render()` is O(N). Internal. */
  readonly _ast: TemplateAst;

  /**
   * Render the template into a single string with the provided variables.
   *
   * @param vars    Required-keys-after-partial input.
   * @param options Optional render flags (`escape`, `strict`).
   * @returns The rendered string.
   * @throws {VariableError} when a required variable is missing or a value
   *   has an unsupported type.
   */
  render(vars: TVars, options?: RenderOptions): string;

  /**
   * Like `render`, but returns a `Result` instead of throwing. Useful at
   * boundaries that already speak in result types.
   *
   * @param vars    Required-keys-after-partial input.
   * @param options Optional render flags.
   * @returns `{ ok: true, value }` on success, `{ ok: false, error }` on failure.
   */
  tryRender(
    vars: TVars,
    options?: RenderOptions,
  ): Result<string, VariableError>;

  /**
   * Return the variable names referenced by the template (after partial
   * application). Useful for editor tooling and dynamic UIs.
   */
  variables(): readonly string[];

  /** Serialize to a JSON-safe shape for storage / hot-reload sources. */
  toJSON(): PromptDefinitionJson;
}

/** JSON-serializable shape of a `PromptDefinition`. */
export interface PromptDefinitionJson {
  readonly id: string;
  readonly version: string | undefined;
  readonly template: string;
  readonly partial: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly tags: string[];
}

/** A single tool / function definition the model may call. */
export interface Tool<TName extends string = string, TParams = unknown> {
  readonly name: TName;
  readonly description: string;
  readonly parameters: JSONSchema;
  /** Phantom property — preserved for inference, not present at runtime. */
  readonly _params?: TParams;
}

/** Builder input for `tool({ ... })`. */
export interface ToolDefinition<TName extends string, TParams = unknown> {
  readonly name: TName;
  readonly description: string;
  readonly parameters: JSONSchema;
  /** Optional TS type witness for the inferred input. */
  readonly _typeWitness?: TParams;
}

/**
 * A single block (turn) inside a `Composition`. `TVars` is the set of
 * required input keys for this block alone — `compose()` intersects
 * across the block list to compute the composition-level shape.
 */
export interface Block<
  R extends Role = Role,
  TVars extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly role: R;
  readonly template: string | undefined;
  readonly examples: readonly { user: string; assistant: string }[];
  readonly partial: Readonly<Record<string, unknown>>;
  readonly cacheBreakpoint: boolean;
  readonly _ast: TemplateAst | undefined;
  /** Phantom witness — preserves `TVars` for inference, not present at runtime. */
  readonly _vars?: TVars;
}

/** Options object accepted by `compose([...], options)`. */
export interface ComposeOptions {
  readonly id?: string;
  readonly version?: string;
  readonly tools?: ReadonlyArray<Tool<string, unknown>>;
  readonly responseSchema?: JSONSchema;
  /** `'auto'` (default) lets adapters honor `cacheBreakpoint`s; `'off'` strips them. */
  readonly cache?: 'auto' | 'off';
}

/**
 * Frozen result of `compose()`. Renders to an ordered `ChatMessage[]`
 * and carries tool / structured-output / cache metadata for adapters.
 */
export interface Composition<
  TVars extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id?: string;
  readonly version?: string;
  readonly blocks: readonly Block[];
  readonly tools: readonly Tool[];
  readonly responseSchema?: JSONSchema;
  readonly cache: 'auto' | 'off';

  /**
   * Render every block into a `ChatMessage` array.
   *
   * @param vars    Required-keys input across all blocks.
   * @param options Optional render flags propagated to each block.
   * @returns The ordered chat-message array.
   * @throws {VariableError} when a required variable is missing.
   */
  render(vars: TVars, options?: RenderOptions): readonly ChatMessage[];

  /**
   * Like `render`, but returns a `Result` instead of throwing.
   */
  tryRender(
    vars: TVars,
    options?: RenderOptions,
  ): Result<readonly ChatMessage[], VariableError>;

  /**
   * Concatenate every rendered message into a single string. System
   * goes first, then alternating turns separated by blank lines.
   *
   * @param vars    Required-keys input across all blocks.
   * @param options Optional render flags.
   * @returns A single concatenated prompt string.
   * @throws {VariableError} when a required variable is missing.
   */
  renderText(vars: TVars, options?: RenderOptions): string;

  variables(): readonly string[];
}
