import { BuilderFrozenError } from '../errors/misc-errors.js';
import { VariableError } from '../errors/variable-error.js';
import type { Result } from '../types/result.js';
import type { InputShape, Prettify } from '../types/input-shape.js';
import { compileTemplate, renderAst } from './template.js';
import type {
  PromptDefinition,
  PromptDefinitionJson,
  RenderOptions,
} from './types.js';

/** Internal generic form of the prompt builder. */
export interface _PromptBuilder<
  TInput extends Record<string, unknown>,
  TPartialKeys extends keyof TInput,
  TVersion extends string | undefined,
> {
  /**
   * Attach a SemVer version. Multiple versions of the same `id` can
   * coexist inside a registry; `latest` / range selectors pick between them.
   *
   * @param semver `MAJOR.MINOR.PATCH` — pre-release tags allowed (`1.0.0-beta.1`).
   * @returns The builder, narrowed to carry the version literal.
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   */
  version<V extends string>(
    semver: V,
  ): _PromptBuilder<TInput, TPartialKeys, V>;

  /**
   * Set the template body. Variable placeholders use `{{name}}` syntax.
   * Optional variables: `{{name?}}`. Typed variables: `{{name:number}}`,
   * `{{name:boolean}}`, `{{items:string[]}}`.
   *
   * Subsequent `.template()` calls replace the previous body.
   *
   * @param body Template literal — its variable placeholders drive type inference.
   * @returns The builder, narrowed to the inferred input shape.
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   * @throws {TemplateError}      when the body cannot be parsed.
   *
   * @example
   * prompt('greet').template('Hi {{name}}, age {{age:number}}');
   */
  template<T extends string>(
    body: T,
  ): _PromptBuilder<InputShape<T>, never, TVersion>;

  /**
   * Refine the inferred input shape. **Non-destructive** — the override
   * is intersected with the inferred shape, narrowing one or two keys
   * without restating every variable.
   *
   * Use `.replaceInput<T>()` instead when the inferred shape is wrong
   * outright (deeply nested object paths, dynamic key sets).
   *
   * @returns The builder with `TInput` updated.
   *
   * @example
   * prompt('p')
   *   .template('Render at {{size}} for {{user}}')
   *   .input<{ size: 'small' | 'medium' | 'large' }>();
   */
  input<TOverride extends Partial<TInput>>(): _PromptBuilder<
    Prettify<Omit<TInput, keyof TOverride> & TOverride>,
    Extract<
      TPartialKeys,
      keyof (Omit<TInput, keyof TOverride> & TOverride)
    >,
    TVersion
  >;

  /**
   * Replace the inferred input shape entirely. Destructive — every key
   * the template needs must be present in `TOverride`.
   *
   * @returns The builder with `TInput` set to `TOverride`.
   */
  replaceInput<TOverride extends Record<string, unknown>>(): _PromptBuilder<
    TOverride,
    Extract<TPartialKeys, keyof TOverride>,
    TVersion
  >;

  /**
   * Pre-fill a subset of the variables. Returns a new builder where the
   * pre-filled keys are tracked as "partial" — `.render()` omits them
   * from the required-keys check.
   *
   * @param values Map of pre-filled variable values.
   * @returns The builder with `TPartialKeys` widened to include the keys.
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   *
   * @example
   * prompt('support').template('You are {{role}}. Answer: {{q}}')
   *   .partial({ role: 'a senior engineer' });
   */
  partial<TKeys extends keyof TInput>(
    values: Pick<TInput, TKeys>,
  ): _PromptBuilder<TInput, TPartialKeys | TKeys, TVersion>;

  /**
   * Attach arbitrary metadata persisted in the registry and serialized
   * output.
   *
   * @param meta JSON-serializable metadata object.
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   */
  metadata(meta: Readonly<Record<string, unknown>>): this;

  /**
   * Attach searchable string tags (`'experimental'`, `'production'`...).
   *
   * @param tags One or more tag strings.
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   */
  tags(...tags: string[]): this;

  /**
   * Provide an optional runtime validator. Return an array of error
   * messages (empty array means valid). A non-empty array throws
   * `VariableError` (`code: 'VARIABLE_VALIDATION_FAILED'`) at render time.
   *
   * @param fn Pure function from vars → list of error messages.
   *
   * @throws {BuilderFrozenError} when called after `.build()`.
   */
  validate(fn: (vars: TInput) => readonly string[]): this;

  /**
   * Finalize the builder into an immutable `PromptDefinition`. After
   * this call the builder is frozen — further chaining throws
   * `BuilderFrozenError`.
   *
   * @returns The frozen prompt definition.
   *
   * @throws {TemplateError} when no template body was supplied.
   */
  build(): PromptDefinition<Prettify<Omit<TInput, TPartialKeys>>, TVersion>;
}

/** Public single-arg alias surfaced in autocomplete. */
export type PromptBuilder<
  TInput extends Record<string, unknown> = Record<string, never>,
> = _PromptBuilder<TInput, never, undefined>;

interface BuilderState {
  readonly id: string;
  template?: string;
  version?: string;
  partial: Record<string, unknown>;
  metadata: Record<string, unknown>;
  tags: string[];
  validator?: (vars: Record<string, unknown>) => readonly string[];
  frozen: boolean;
}

const checkLive = (state: BuilderState, method: string): void => {
  if (state.frozen) throw new BuilderFrozenError(method);
};

const makeBuilder = (
  state: BuilderState,
): _PromptBuilder<Record<string, unknown>, never, string | undefined> => {
  const builder: _PromptBuilder<
    Record<string, unknown>,
    never,
    string | undefined
  > = {
    version<V extends string>(
      semver: V,
    ): _PromptBuilder<Record<string, unknown>, never, V> {
      checkLive(state, 'version');
      state.version = semver;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return builder as any;
    },

    template<T extends string>(
      body: T,
    ): _PromptBuilder<InputShape<T>, never, string | undefined> {
      checkLive(state, 'template');
      state.template = body;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return builder as any;
    },

    input() {
      checkLive(state, 'input');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return builder as any;
    },

    replaceInput() {
      checkLive(state, 'replaceInput');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return builder as any;
    },

    partial(values) {
      checkLive(state, 'partial');
      Object.assign(state.partial, values);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return builder as any;
    },

    metadata(meta) {
      checkLive(state, 'metadata');
      Object.assign(state.metadata, meta);
      return builder;
    },

    tags(...tags) {
      checkLive(state, 'tags');
      state.tags.push(...tags);
      return builder;
    },

    validate(fn) {
      checkLive(state, 'validate');
      state.validator = fn as (
        vars: Record<string, unknown>,
      ) => readonly string[];
      return builder;
    },

    build() {
      checkLive(state, 'build');
      const body = state.template ?? '';
      const ast = compileTemplate(body);
      const partial = Object.freeze({ ...state.partial });
      const metadata = Object.freeze({ ...state.metadata });
      const tags = Object.freeze([...state.tags]);
      const validator = state.validator;
      const id = state.id;
      const version = state.version;
      state.frozen = true;

      const def: PromptDefinition<Record<string, unknown>, string | undefined> =
        Object.freeze({
          id,
          version,
          template: body,
          partial,
          metadata,
          tags,
          _ast: ast,

          render(
            vars: Record<string, unknown>,
            options?: RenderOptions,
          ): string {
            const merged: Record<string, unknown> = { ...partial, ...vars };
            if (validator) {
              let errors: readonly string[];
              try {
                errors = validator(merged);
              } catch (cause) {
                throw new VariableError(
                  'VARIABLE_VALIDATION_FAILED',
                  `validate() callback for prompt '${id}' threw`,
                  { templateId: id, cause },
                );
              }
              if (errors.length > 0) {
                throw new VariableError(
                  'VARIABLE_VALIDATION_FAILED',
                  `Validation failed: ${errors.join('; ')}`,
                  { validationErrors: errors, templateId: id },
                );
              }
            }
            return renderAst(ast, vars, partial, options, id);
          },

          tryRender(
            vars: Record<string, unknown>,
            options?: RenderOptions,
          ): Result<string, VariableError> {
            try {
              return { ok: true, value: def.render(vars, options) };
            } catch (e) {
              if (e instanceof VariableError) return { ok: false, error: e };
              throw e;
            }
          },

          variables(): readonly string[] {
            return ast.variables.filter(
              (v) => !Object.prototype.hasOwnProperty.call(partial, v),
            );
          },

          toJSON(): PromptDefinitionJson {
            return {
              id,
              version,
              template: body,
              partial: { ...partial },
              metadata: { ...metadata },
              tags: [...tags],
            };
          },
        });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return def as any;
    },
  };

  return builder;
};

/**
 * Define a versioned, typed prompt template.
 *
 * Variable names declared in the template (with `{{name}}` syntax) are
 * extracted at compile time using template-literal types, so `render()`
 * is fully type-checked against the template body.
 *
 * @param id Stable identifier for this prompt across versions. Unique per registry.
 * @returns A chainable `PromptBuilder`.
 *
 * @example
 * const greet = prompt('greet.user')
 *   .version('1.0.0')
 *   .template('Hello {{name}}, you have {{count:number}} new messages.')
 *   .build();
 *
 * greet.render({ name: 'Alice', count: 3 });
 */
export function prompt(id: string): PromptBuilder {
  const state: BuilderState = {
    id,
    partial: {},
    metadata: {},
    tags: [],
    frozen: false,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return makeBuilder(state) as any;
}

/**
 * Reconstruct a `PromptDefinition` from its JSON form. Used by the
 * registry when loading prompts from `PromptSource.load()` results.
 *
 * @param json Serialized prompt definition.
 * @returns The frozen prompt definition.
 *
 * @throws {TemplateError} when the serialized template body cannot be parsed.
 */
export function fromJSON(json: PromptDefinitionJson): PromptDefinition {
  const builder = prompt(json.id) as unknown as _PromptBuilder<
    Record<string, unknown>,
    never,
    string | undefined
  >;
  if (json.version !== undefined) builder.version(json.version);
  builder.template(json.template);
  if (Object.keys(json.partial).length > 0) builder.partial(json.partial);
  if (Object.keys(json.metadata).length > 0) builder.metadata(json.metadata);
  if (json.tags.length > 0) builder.tags(...json.tags);
  return builder.build() as PromptDefinition;
}
