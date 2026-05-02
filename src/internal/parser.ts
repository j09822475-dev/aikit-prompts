import { TemplateError } from '../errors/template-error.js';
import type {
  TemplateAst,
  TemplateNode,
  VarNode,
  VarType,
} from './ast.js';

/**
 * Cursor-driven parser state shared by the core scanner and any
 * registered directive parsers (`{{#if}}`, `{{#each}}`, etc.).
 *
 * Directive parsers receive this state when invoked, advance `pos` past
 * the closing tag they handle, and return the parsed node so the core
 * scanner can append it to the current child list.
 */
export interface ParserState {
  readonly source: string;
  pos: number;
  /** Stack of currently-open block tags, used for `{{/foo}}` matching. */
  readonly blockStack: BlockFrame[];
  /** Variables referenced anywhere in the AST, in declaration order. */
  readonly variables: string[];
  /** Variables that have only ever appeared as `{{name?}}`. */
  readonly optionalSet: Set<string>;
  /** Set of variables marked required (cleared from `optionalSet`). */
  readonly requiredSet: Set<string>;
}

interface BlockFrame {
  readonly tag: string;
  readonly position: number;
}

/**
 * Signature of a directive parser. Called when the core scanner
 * encounters an opening `{{#name ... }}` tag and consumes input through
 * the matching `{{/name}}` tag.
 */
export type DirectiveParser = (
  state: ParserState,
  args: string,
  parseChildren: (state: ParserState, terminator: string) => TemplateNode[],
) => TemplateNode;

/**
 * Signature of an inline directive parser (no closing tag). Used for
 * `{{> partial}}`-style single-token directives.
 */
export type InlineDirectiveParser = (
  state: ParserState,
  args: string,
) => TemplateNode;

interface DirectiveRegistry {
  block: Map<string, DirectiveParser>;
  inline: Map<string, InlineDirectiveParser>;
}

const REGISTRY_SYMBOL = Symbol.for('@aikit/prompts/directives');
type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY_SYMBOL]?: DirectiveRegistry;
};
const globalWithRegistry = globalThis as GlobalWithRegistry;
if (globalWithRegistry[REGISTRY_SYMBOL] === undefined) {
  globalWithRegistry[REGISTRY_SYMBOL] = {
    block: new Map(),
    inline: new Map(),
  };
}
const directives = globalWithRegistry[REGISTRY_SYMBOL];
const blockDirectives = directives.block;
const inlineDirectives = directives.inline;

/**
 * Register a block-form directive (`{{#name ...}} ... {{/name}}`).
 * The parser will hand control to `parser` when it sees the opening tag
 * and expects `parser` to consume input through the matching close.
 *
 * Used by the `template-extras` subpath to add `{{#if}}` / `{{#each}}`.
 *
 * @param name   Tag name without the leading `#`.
 * @param parser Directive-specific handler.
 */
export const registerBlockDirective = (
  name: string,
  parser: DirectiveParser,
): void => {
  blockDirectives.set(name, parser);
};

/**
 * Register an inline directive (`{{> name args}}`, no closing tag).
 *
 * @param prefix Single-character lead-in (e.g. `'>'` for partials).
 * @param parser Directive-specific handler.
 */
export const registerInlineDirective = (
  prefix: string,
  parser: InlineDirectiveParser,
): void => {
  inlineDirectives.set(prefix, parser);
};

const VAR_TYPES: ReadonlySet<VarType> = new Set([
  'string',
  'number',
  'boolean',
  'string[]',
  'number[]',
  'boolean[]',
]);

const trim = (s: string): string => s.replace(/^[\s]+|[\s]+$/g, '');

const snippetAround = (source: string, position: number): string => {
  const start = Math.max(0, position - 20);
  const end = Math.min(source.length, position + 20);
  return source.slice(start, end);
};

const fail = (
  state: ParserState,
  code:
    | 'TEMPLATE_PARSE'
    | 'TEMPLATE_UNCLOSED_TAG'
    | 'TEMPLATE_UNKNOWN_DIRECTIVE',
  message: string,
): never => {
  throw new TemplateError(code, message, {
    position: state.pos,
    snippet: snippetAround(state.source, state.pos),
  });
};

const parseVarToken = (raw: string, state: ParserState): VarNode => {
  const trimmed = trim(raw);
  let name = trimmed;
  let typeToken: VarType = 'string';
  let optional = false;

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx >= 0) {
    name = trim(trimmed.slice(0, colonIdx));
    const typeRaw = trim(trimmed.slice(colonIdx + 1)) as VarType;
    if (!VAR_TYPES.has(typeRaw)) {
      return fail(
        state,
        'TEMPLATE_PARSE',
        `Unknown variable type token '${typeRaw}' in '{{${trimmed}}}'`,
      );
    }
    typeToken = typeRaw;
  }

  if (name.endsWith('?')) {
    optional = true;
    name = name.slice(0, -1);
  }

  if (name === '') {
    return fail(
      state,
      'TEMPLATE_PARSE',
      `Empty variable name in '{{${trimmed}}}'`,
    );
  }

  if (optional) {
    if (!state.requiredSet.has(name)) state.optionalSet.add(name);
  } else {
    state.optionalSet.delete(name);
    state.requiredSet.add(name);
  }
  if (!state.variables.includes(name)) state.variables.push(name);

  return { type: 'var', name, optional, typeToken };
};

/**
 * Find the next `{{` that is not escaped. Recognizes `\{\{` as a
 * literal-brace marker that the renderer un-escapes back to `{{`.
 *
 * @returns Position of the next opening tag, or -1 when none remain.
 */
const findNextOpen = (source: string, from: number): number => {
  let i = from;
  while (i < source.length) {
    const idx = source.indexOf('{{', i);
    if (idx < 0) return -1;
    if (idx > 0 && source[idx - 1] === '\\') {
      i = idx + 2;
      continue;
    }
    return idx;
  }
  return -1;
};

const parseChildrenUntil = (
  state: ParserState,
  terminator: string,
): TemplateNode[] => {
  const out: TemplateNode[] = [];
  while (state.pos < state.source.length) {
    const next = findNextOpen(state.source, state.pos);
    if (next < 0) {
      if (terminator !== '')
        fail(
          state,
          'TEMPLATE_UNCLOSED_TAG',
          `Unclosed block — expected closing tag '{{${terminator}}}'`,
        );
      out.push({
        type: 'text',
        value: unescapeBraces(state.source.slice(state.pos)),
      });
      state.pos = state.source.length;
      break;
    }

    if (next > state.pos) {
      out.push({
        type: 'text',
        value: unescapeBraces(state.source.slice(state.pos, next)),
      });
    }
    state.pos = next + 2;

    const close = state.source.indexOf('}}', state.pos);
    if (close < 0) {
      state.pos = next;
      fail(state, 'TEMPLATE_UNCLOSED_TAG', `Unclosed '{{' tag`);
    }
    const inner = state.source.slice(state.pos, close);
    state.pos = close + 2;

    const tokenTrimmed = trim(inner);

    if (tokenTrimmed.startsWith('!--') && tokenTrimmed.endsWith('--')) {
      out.push({
        type: 'comment',
        value: tokenTrimmed.slice(3, -2).trim(),
      });
      continue;
    }

    if (tokenTrimmed.startsWith('/')) {
      const closing = tokenTrimmed.slice(1).trim();
      if (terminator === '' || closing !== terminator) {
        fail(
          state,
          'TEMPLATE_PARSE',
          `Unexpected closing tag '{{/${closing}}}'`,
        );
      }
      return out;
    }

    if (tokenTrimmed.startsWith('#')) {
      const space = tokenTrimmed.indexOf(' ');
      const name =
        space < 0 ? tokenTrimmed.slice(1) : tokenTrimmed.slice(1, space);
      const args = space < 0 ? '' : trim(tokenTrimmed.slice(space + 1));
      const handler = blockDirectives.get(name);
      if (handler === undefined) {
        return fail(
          state,
          'TEMPLATE_UNKNOWN_DIRECTIVE',
          `Unknown block directive '{{#${name}}}' — import '@aikit/prompts/template-extras' to enable iteration directives.`,
        );
      }
      state.blockStack.push({ tag: name, position: state.pos });
      const node = handler(state, args, parseChildrenUntil);
      state.blockStack.pop();
      out.push(node);
      continue;
    }

    const inlinePrefix = tokenTrimmed[0];
    if (inlinePrefix !== undefined && inlineDirectives.has(inlinePrefix)) {
      const handler = inlineDirectives.get(inlinePrefix);
      if (handler) {
        out.push(handler(state, trim(tokenTrimmed.slice(1))));
        continue;
      }
    }

    out.push(parseVarToken(inner, state));
  }

  if (terminator !== '') {
    fail(
      state,
      'TEMPLATE_UNCLOSED_TAG',
      `Unclosed block — expected closing tag '{{${terminator}}}'`,
    );
  }
  return out;
};

const unescapeBraces = (s: string): string =>
  s.replace(/\\\{\\\{/g, '{{').replace(/\\\}\\\}/g, '}}');

/**
 * Parse a template source string into an immutable `TemplateAst`.
 *
 * The core parser supports `{{var}}`, `{{var?}}`, `{{var:type}}`, and
 * `{{!-- comment --}}`. Iteration directives (`{{#if}}`, `{{#each}}`,
 * `{{> partial}}`) are added by importing
 * `@aikit/prompts/template-extras`, which calls `registerBlockDirective`
 * / `registerInlineDirective` on this module.
 *
 * @param source Template body to parse.
 * @returns The compiled AST.
 *
 * @throws {TemplateError} when the source has unclosed tags, unknown
 *   directives, or malformed variable tokens.
 *
 * @example
 * const ast = parseTemplate('Hello {{name}}!');
 * ast.variables; // ['name']
 */
export function parseTemplate(source: string): TemplateAst {
  const state: ParserState = {
    source,
    pos: 0,
    blockStack: [],
    variables: [],
    optionalSet: new Set(),
    requiredSet: new Set(),
  };
  const nodes = parseChildrenUntil(state, '');
  return Object.freeze({
    source,
    nodes: Object.freeze(nodes),
    variables: Object.freeze([...state.variables]),
    optionalVariables: Object.freeze([...state.optionalSet]),
  });
}
