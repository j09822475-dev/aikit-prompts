import { TemplateError } from '../errors/template-error.js';
import type { EachNode } from '../internal/ast.js';
import { registerBlockDirective } from '../internal/parser.js';
import { registerDirectiveRenderer } from '../core/template.js';
import { resolveVar, type RenderContext } from '../core/render-context.js';

let installed = false;

/**
 * Install the `{{#each items}}...{{/each}}` directive into the parser.
 * Each iteration exposes the current item as `{{this}}` and the index
 * as `{{@index}}` inside the inner block.
 */
export const enableEach = (): void => {
  if (installed) return;
  installed = true;

  registerBlockDirective('each', (state, args, parseChildren): EachNode => {
    if (args.length === 0) {
      throw new TemplateError(
        'TEMPLATE_PARSE',
        `'{{#each}}' directive requires an iterable variable name`,
        { position: state.pos },
      );
    }
    if (!state.variables.includes(args)) state.variables.push(args);
    const children = parseChildren(state, 'each');
    return {
      type: 'each',
      name: args,
      children: Object.freeze([...children]),
    };
  });

  registerDirectiveRenderer('each', (node, ctx, renderNodes) => {
    const eachNode = node as EachNode;
    const value = resolveVar(ctx, eachNode.name);
    if (!Array.isArray(value)) return '';

    let out = '';
    for (let i = 0; i < value.length; i++) {
      const innerVars = {
        ...ctx.vars,
        this: value[i],
        ['@index']: i,
      };
      const innerCtx: RenderContext = { ...ctx, vars: innerVars };
      out += renderNodes(eachNode.children, innerCtx);
    }
    return out;
  });
};
