import { VariableError } from '../errors/variable-error.js';
import { invariant } from '../internal/invariant.js';
import type { TemplateAst, TemplateNode } from '../internal/ast.js';
import { parseTemplate } from '../internal/parser.js';
import {
  resolveVar,
  stringifyValue,
  type RenderContext,
} from './render-context.js';
import type { RenderOptions } from './types.js';

/**
 * Hook function used by the `template-extras` subpath to evaluate
 * iteration directives (`if`, `each`, `partial`) at render time. The
 * core ships one entry per supported directive node type; extras
 * subpaths register more via this map at module-load time.
 */
export type DirectiveRenderer = (
  node: TemplateNode,
  ctx: RenderContext,
  renderNodes: (
    nodes: readonly TemplateNode[],
    ctx: RenderContext,
  ) => string,
) => string;

const RENDERER_SYMBOL = Symbol.for('@aikit/prompts/directive-renderers');
type GlobalWithRenderers = typeof globalThis & {
  [RENDERER_SYMBOL]?: Map<string, DirectiveRenderer>;
};
const globalWithRenderers = globalThis as GlobalWithRenderers;
if (globalWithRenderers[RENDERER_SYMBOL] === undefined) {
  globalWithRenderers[RENDERER_SYMBOL] = new Map();
}
const directiveRenderers = globalWithRenderers[RENDERER_SYMBOL];

/**
 * Register a render-time evaluator for a directive node type emitted by
 * a registered parser directive. Called by `template-extras`.
 *
 * @param type     The `TemplateNode['type']` discriminant value.
 * @param renderer Function that returns the rendered string for that node.
 */
export const registerDirectiveRenderer = (
  type: string,
  renderer: DirectiveRenderer,
): void => {
  directiveRenderers.set(type, renderer);
};

const renderNodes = (
  nodes: readonly TemplateNode[],
  ctx: RenderContext,
): string => {
  let out = '';
  for (const node of nodes) {
    out += renderNode(node, ctx);
  }
  return out;
};

const renderNode = (node: TemplateNode, ctx: RenderContext): string => {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'comment':
      return '';
    case 'var': {
      const value = resolveVar(ctx, node.name);
      if (value === undefined || value === null) {
        if (node.optional) return '';
        if (!ctx.missing.includes(node.name)) ctx.missing.push(node.name);
        return '';
      }
      return stringifyValue(value, node.name, ctx);
    }
    default: {
      const directive = directiveRenderers.get(node.type);
      invariant(
        directive !== undefined,
        `No renderer registered for AST node type '${node.type}'. ` +
          `Did you import '@aikit/prompts/template-extras'?`,
      );
      return directive(node, ctx, renderNodes);
    }
  }
};

const isProductionRuntime = (): boolean => {
  try {
    return (
      typeof process !== 'undefined' &&
      typeof process.env !== 'undefined' &&
      process.env['NODE_ENV'] === 'production'
    );
  } catch {
    return false;
  }
};

/**
 * Render a compiled AST against the supplied variables.
 *
 * @param ast        Compiled template AST.
 * @param vars       Caller-supplied variables (by name).
 * @param partial    Pre-filled variables from `.partial(...)`.
 * @param options    Optional render flags.
 * @param templateId Optional id of the template (propagated into errors).
 * @returns The rendered string.
 *
 * @throws {VariableError} when required variables are missing or a value
 *   has an unsupported type.
 */
export function renderAst(
  ast: TemplateAst,
  vars: Readonly<Record<string, unknown>>,
  partial: Readonly<Record<string, unknown>>,
  options: RenderOptions | undefined,
  templateId: string | undefined,
): string {
  const ctx: RenderContext = {
    vars,
    partial,
    escape: options?.escape ?? 'none',
    strict: options?.strict ?? true,
    referenced: new Set(ast.variables),
    missing: [],
    ...(templateId !== undefined ? { templateId } : {}),
  };

  if (ctx.strict && !isProductionRuntime()) {
    for (const k of Object.keys(vars)) {
      if (!ctx.referenced.has(k)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[@aikit/prompts] Unknown variable '${k}' passed to template${
            templateId !== undefined ? ` '${templateId}'` : ''
          } — will be ignored.`,
        );
      }
    }
  }

  const out = renderNodes(ast.nodes, ctx);

  if (ctx.missing.length > 0) {
    throw VariableError.missing(ctx.missing, templateId);
  }

  return out;
}

/**
 * Compile a template source string into an AST. Re-export of the
 * internal parser, exposed here so callers writing custom tooling can
 * inspect the structure without importing internal modules.
 *
 * @param source Template body.
 * @returns The compiled AST.
 *
 * @throws {TemplateError} on parser failure.
 */
export const compileTemplate = (source: string): TemplateAst =>
  parseTemplate(source);

/**
 * Static analysis helper — return the variable names referenced by a
 * template source string. Used by editor tooling and the registry's
 * shape introspection helpers.
 *
 * @param source Template body.
 * @returns Variable names in declaration order.
 *
 * @throws {TemplateError} on parser failure.
 */
export const extract = (source: string): readonly string[] =>
  parseTemplate(source).variables;
