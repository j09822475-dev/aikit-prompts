/**
 * Template AST node types. The core parser produces `Text`, `Var`, and
 * `Comment` nodes; iteration directives (`If`, `Each`, `Partial`) are
 * parsed by the `template-extras` subpath via the `registerDirective`
 * extension hook.
 */
export type TemplateNode =
  | TextNode
  | VarNode
  | CommentNode
  | IfNode
  | EachNode
  | PartialNode;

/** Static text. Verbatim segment between/inside variable markers. */
export interface TextNode {
  readonly type: 'text';
  readonly value: string;
}

/**
 * Variable substitution: `{{name}}`, `{{name?}}`, `{{name:number}}`,
 * `{{name?:number}}`.
 */
export interface VarNode {
  readonly type: 'var';
  readonly name: string;
  readonly optional: boolean;
  /** Declared type token (`'string'` by default, parsed from `{{name:type}}`). */
  readonly typeToken: VarType;
}

/** Source comment: `{{!-- comment text --}}`. Stripped from output. */
export interface CommentNode {
  readonly type: 'comment';
  readonly value: string;
}

/** Conditional block: `{{#if name}} ... {{/if}}`. Provided by `template-extras`. */
export interface IfNode {
  readonly type: 'if';
  readonly name: string;
  readonly children: readonly TemplateNode[];
  readonly elseChildren?: readonly TemplateNode[];
}

/** Iteration block: `{{#each items}} ... {{/each}}`. Provided by `template-extras`. */
export interface EachNode {
  readonly type: 'each';
  readonly name: string;
  readonly children: readonly TemplateNode[];
}

/** Partial inclusion: `{{> name}}`. Provided by `template-extras`. */
export interface PartialNode {
  readonly type: 'partial';
  readonly name: string;
}

/**
 * Recognized variable type tokens. Anything else falls back to `string`
 * at parse time.
 */
export type VarType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'string[]'
  | 'number[]'
  | 'boolean[]';

/**
 * Compiled template AST. The full immutable representation that
 * `render()` walks. Cached on `PromptDefinition` so each render is O(N)
 * over the template length, not O(N) over the source string.
 */
export interface TemplateAst {
  readonly source: string;
  readonly nodes: readonly TemplateNode[];
  /** Variable names referenced anywhere in the AST, in declaration order. */
  readonly variables: readonly string[];
  /** Variable names that appear only as `{{name?}}` (never required). */
  readonly optionalVariables: readonly string[];
}
