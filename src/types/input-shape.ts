import type { ExtractVariables } from './extract-vars.js';

/**
 * Mapped-type identity that flattens an intersection chain into a single
 * object literal in editor hovers. Without this, callers see
 * `A & B & C` instead of `{ a; b; c }` in tooltips.
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * The required input shape for a template-literal type.
 *
 * Wraps `ExtractVariables<T>` in `Prettify` so the editor shows a
 * collapsed object shape rather than the raw intersection chain.
 *
 * @example
 * type Input = InputShape<'Hello {{name}}, age {{age:number}}'>;
 * // = { name: string; age: number }
 */
export type InputShape<T extends string> = Prettify<ExtractVariables<T>>;
