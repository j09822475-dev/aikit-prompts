/**
 * Trim leading/trailing whitespace from a string-literal type.
 */
export type Trim<S extends string> = S extends ` ${infer R}`
  ? Trim<R>
  : S extends `\t${infer R}`
    ? Trim<R>
    : S extends `\n${infer R}`
      ? Trim<R>
      : S extends `${infer R} `
        ? Trim<R>
        : S extends `${infer R}\t`
          ? Trim<R>
          : S extends `${infer R}\n`
            ? Trim<R>
            : S;

/**
 * Map a declared type token (after the `:` in `{{name:type}}`) to its
 * TypeScript counterpart. Unknown tokens fall back to `string`.
 */
export type TypeOf<S extends string> = S extends 'string'
  ? string
  : S extends 'number'
    ? number
    : S extends 'boolean'
      ? boolean
      : S extends 'string[]'
        ? string[]
        : S extends 'number[]'
          ? number[]
          : S extends 'boolean[]'
            ? boolean[]
            : string;

type VarEntry<NameRaw extends string, TypeRaw extends string> =
  Trim<NameRaw> extends `${infer Name}?`
    ? { [K in Trim<Name>]?: TypeOf<Trim<TypeRaw>> }
    : { [K in Trim<NameRaw>]: TypeOf<Trim<TypeRaw>> };

/**
 * Walk a template-literal type, extracting every `{{var}}` placeholder
 * and folding it into a record of name → declared TypeScript type.
 *
 * Recognized syntax inside `{{ ... }}`:
 *   - `name`              → required string
 *   - `name?`             → optional string
 *   - `name:string`       → required string (explicit)
 *   - `name:number`       → required number
 *   - `name:boolean`      → required boolean
 *   - `name:string[]`     → required string[]
 *   - `name?:number`      → optional number
 *
 * Whitespace inside `{{ ... }}` is tolerated.
 */
export type ExtractVariables<T extends string> =
  T extends `${string}{{${infer Token}}}${infer Rest}`
    ? Trim<Token> extends `${infer NameRaw}:${infer TypeRaw}`
      ? VarEntry<NameRaw, TypeRaw> & ExtractVariables<Rest>
      : Trim<Token> extends `${infer Name}?`
        ? { [K in Trim<Name>]?: string } & ExtractVariables<Rest>
        : { [K in Trim<Token>]: string } & ExtractVariables<Rest>
    : // eslint-disable-next-line @typescript-eslint/ban-types
      {};
