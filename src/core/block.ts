import { BuilderFrozenError } from '../errors/misc-errors.js';
import type { Role } from '../types/role.js';
import type { InputShape } from '../types/input-shape.js';
import { compileTemplate } from './template.js';
import type { Block } from './types.js';

/**
 * Builder returned by `block(role)`. Mirrors `prompt()` but tags the
 * output with a conversation role and supports few-shot examples and
 * cache breakpoints.
 */
export interface BlockBuilder<
  R extends Role,
  TInput extends Record<string, unknown>,
> {
  /**
   * Set the template body for this block. Same `{{var}}` syntax as
   * `prompt(...).template(...)`.
   *
   * @param body Template literal (drives type inference for `TInput`).
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   * @throws {TemplateError}      when the body cannot be parsed.
   */
  template<T extends string>(body: T): BlockBuilder<R, InputShape<T>>;

  /**
   * Attach few-shot example pairs. Each pair expands into a
   * `user` + `assistant` turn at the position of this block.
   *
   * @param pairs Array of `{ user, assistant }` example messages.
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   *
   * @example
   * block('user').examples([
   *   { user: 'Hi', assistant: 'Hello!' },
   *   { user: 'Bye', assistant: 'Goodbye!' },
   * ]);
   */
  examples(
    pairs: ReadonlyArray<{ user: string; assistant: string }>,
  ): BlockBuilder<R, TInput>;

  /**
   * Pre-fill a subset of this block's variables.
   *
   * @param vals Map of pre-filled variable values.
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   */
  partial<K extends keyof TInput>(
    vals: Pick<TInput, K>,
  ): BlockBuilder<R, Omit<TInput, K>>;

  /**
   * Mark a cache breakpoint at this point in the conversation. Adapters
   * translate this into provider-specific cache hints (Anthropic
   * `cache_control: { type: 'ephemeral' }`, OpenAI `prompt_cache_key`).
   *
   * Up to 4 breakpoints per composition (Anthropic limit). Excess
   * breakpoints collapse to the last 4 with a one-time warning.
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   */
  cacheBreakpoint(): BlockBuilder<R, TInput>;

  /**
   * Finalize the builder into an immutable `Block`.
   *
   * @returns The frozen block.
   *
   * @throws {TemplateError} when the template body has parse errors.
   */
  build(): Block<R, TInput>;
}

interface BlockState {
  readonly role: Role;
  template?: string;
  examples: { user: string; assistant: string }[];
  partial: Record<string, unknown>;
  cacheBreakpoint: boolean;
  frozen: boolean;
}

const checkLive = (state: BlockState, method: string): void => {
  if (state.frozen) throw new BuilderFrozenError(method);
};

const makeBlockBuilder = (
  state: BlockState,
): BlockBuilder<Role, Record<string, unknown>> => {
  const builder: BlockBuilder<Role, Record<string, unknown>> = {
    template<T extends string>(
      body: T,
    ): BlockBuilder<Role, InputShape<T>> {
      checkLive(state, 'template');
      state.template = body;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return builder as any;
    },

    examples(pairs) {
      checkLive(state, 'examples');
      state.examples.push(...pairs);
      return builder as never;
    },

    partial(vals) {
      checkLive(state, 'partial');
      Object.assign(state.partial, vals);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return builder as any;
    },

    cacheBreakpoint() {
      checkLive(state, 'cacheBreakpoint');
      state.cacheBreakpoint = true;
      return builder;
    },

    build(): Block<Role, Record<string, unknown>> {
      checkLive(state, 'build');
      const ast =
        state.template !== undefined
          ? compileTemplate(state.template)
          : undefined;
      const block: Block<Role, Record<string, unknown>> = Object.freeze({
        role: state.role,
        template: state.template,
        examples: Object.freeze([...state.examples]),
        partial: Object.freeze({ ...state.partial }),
        cacheBreakpoint: state.cacheBreakpoint,
        _ast: ast,
      });
      state.frozen = true;
      return block;
    },
  };

  return builder;
};

/**
 * Define a single message block (a turn in the conversation).
 *
 * @param role Conversation role: `'system' | 'user' | 'assistant' | 'tool'`.
 * @returns A chainable `BlockBuilder`.
 *
 * @example
 * const sys = block('system')
 *   .template('You are {{persona}}.')
 *   .cacheBreakpoint()
 *   .build();
 */
export function block<R extends Role>(role: R): BlockBuilder<R, {}> {
  const state: BlockState = {
    role,
    examples: [],
    partial: {},
    cacheBreakpoint: false,
    frozen: false,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return makeBlockBuilder(state) as any;
}
