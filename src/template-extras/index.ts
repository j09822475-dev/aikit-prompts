import { enableIf } from './if.js';
import { enableEach } from './each.js';
import { enablePartials, registerPartial, unregisterPartial } from './partial.js';

/**
 * Enable iteration directives (`{{#if}}`, `{{#each}}`) and partial
 * inclusion (`{{> name}}`) in the template parser. Idempotent.
 *
 * Importing this subpath (`@aikit/prompts/template-extras`) does NOT
 * automatically activate the directives — call this function once at
 * application startup. The split keeps the core parser surface small
 * and the activation explicit.
 *
 * @example
 * import { withIfEach } from '@aikit/prompts/template-extras';
 * withIfEach();
 * // now `{{#if x}}...{{/if}}` and `{{#each items}}...{{/each}}` parse.
 */
export const withIfEach = (): void => {
  enableIf();
  enableEach();
};

/**
 * Enable `{{> name}}` partial-inclusion in the parser and provide the
 * `registerPartial` / `unregisterPartial` API. Idempotent.
 */
export const withPartials = (): void => {
  enablePartials();
};

export { registerPartial, unregisterPartial };
