import { applyEscape, type EscapeMode } from '../internal/escape.js';
import { VariableError } from '../errors/variable-error.js';

/**
 * Internal render-time context shared by the core renderer and any
 * directive evaluators registered via `template-extras`.
 */
export interface RenderContext {
  readonly vars: Readonly<Record<string, unknown>>;
  readonly partial: Readonly<Record<string, unknown>>;
  readonly escape: EscapeMode;
  readonly strict: boolean;
  /** Variables actually referenced by the template — used for strict-mode unknown-key warnings. */
  readonly referenced: ReadonlySet<string>;
  /** Track missing-required variables so we can throw once with the full list. */
  readonly missing: string[];
  /** Optional prompt id, propagated into thrown `VariableError`s. */
  readonly templateId?: string;
}

/**
 * Resolve a variable lookup, preferring the call-time `vars` over the
 * `partial` baseline.
 *
 * @param ctx  Active render context.
 * @param name Variable name to resolve.
 * @returns The resolved value, or `undefined` if neither map has it.
 */
export const resolveVar = (
  ctx: RenderContext,
  name: string,
): unknown => {
  if (Object.prototype.hasOwnProperty.call(ctx.vars, name)) return ctx.vars[name];
  if (Object.prototype.hasOwnProperty.call(ctx.partial, name)) return ctx.partial[name];
  return undefined;
};

/**
 * Coerce a resolved variable value into a string for substitution.
 * Throws on unsupported types (functions, Symbols, class instances).
 *
 * @param value Resolved value (may be primitive, array, or plain object).
 * @param name  Variable name (for diagnostic context).
 * @param ctx   Active render context.
 * @returns The string representation, escaped per `ctx.escape`.
 *
 * @throws {VariableError} when `value` has an unsupported type.
 */
export const stringifyValue = (
  value: unknown,
  name: string,
  ctx: RenderContext,
): string => {
  if (value === null || value === undefined) return '';

  const type = typeof value;

  if (type === 'string') return applyEscape(ctx.escape, value as string);
  if (type === 'number' || type === 'bigint' || type === 'boolean') {
    return applyEscape(ctx.escape, String(value));
  }

  if (type === 'function' || type === 'symbol') {
    throw new VariableError(
      'VARIABLE_TYPE_MISMATCH',
      `Variable '${name}' has unsupported type '${type}' — pass a primitive, array, or plain object.`,
      ctx.templateId !== undefined
        ? { invalid: name, templateId: ctx.templateId }
        : { invalid: name },
    );
  }

  if (type === 'object') {
    if (ctx.escape === 'json') {
      try {
        return JSON.stringify(value);
      } catch (cause) {
        throw new VariableError(
          'VARIABLE_TYPE_MISMATCH',
          `Variable '${name}' could not be JSON-encoded (likely a circular reference).`,
          ctx.templateId !== undefined
            ? { invalid: name, templateId: ctx.templateId, cause }
            : { invalid: name, cause },
        );
      }
    }

    if (Array.isArray(value)) {
      return applyEscape(ctx.escape, value.map((v) => String(v)).join(', '));
    }

    return applyEscape(ctx.escape, String(value));
  }

  return applyEscape(ctx.escape, String(value));
};
