import { TemplateError } from '../errors/template-error.js';
import type { PartialNode } from '../internal/ast.js';
import { registerInlineDirective } from '../internal/parser.js';
import { registerDirectiveRenderer } from '../core/template.js';

const partials = new Map<string, string>();

/**
 * Register a named partial available to `{{> name}}` directives.
 *
 * @param name Identifier referenced by the `{{> name}}` placeholder.
 * @param body Template body inserted at the inclusion point.
 */
export const registerPartial = (name: string, body: string): void => {
  partials.set(name, body);
};

/**
 * Remove a previously registered partial.
 *
 * @param name Identifier of the partial to remove.
 * @returns `true` if a partial with that name was removed, `false` otherwise.
 */
export const unregisterPartial = (name: string): boolean =>
  partials.delete(name);

let installed = false;

/**
 * Install the `{{> name}}` partial-inclusion directive into the parser.
 */
export const enablePartials = (): void => {
  if (installed) return;
  installed = true;

  registerInlineDirective('>', (state, args): PartialNode => {
    if (args.length === 0) {
      throw new TemplateError(
        'TEMPLATE_PARSE',
        `'{{> partial}}' directive requires a partial name`,
        { position: state.pos },
      );
    }
    return { type: 'partial', name: args };
  });

  registerDirectiveRenderer('partial', (node) => {
    const partialNode = node as PartialNode;
    const body = partials.get(partialNode.name);
    if (body === undefined) {
      return `[unknown partial '${partialNode.name}']`;
    }
    return body;
  });
};
