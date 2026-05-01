/** Escape mode applied to substituted variable values. */
export type EscapeMode = 'none' | 'markdown' | 'json';

const MARKDOWN_PUNCTUATION = /([\\*_~|>#`\[\]])/g;

/**
 * Markdown-escape a value so user-supplied text cannot break out of the
 * surrounding prompt formatting.
 *
 * Handles the tokens an LLM input parser typically interprets:
 * `\\ * _ ~ | > # \` [ ]`.
 *
 * @param value Text to escape.
 * @returns The escaped string.
 *
 * @example
 * escapeMarkdown('foo *bar*'); // 'foo \\*bar\\*'
 */
export const escapeMarkdown = (value: string): string =>
  value.replace(MARKDOWN_PUNCTUATION, '\\$1');

/**
 * Serialize a value to JSON. Used by `render({ escape: 'json' })` for
 * variables that hold structured data the prompt should embed as JSON.
 *
 * @param value Any JSON-serializable value.
 * @returns The serialized JSON string.
 *
 * @throws {TypeError} when `value` contains a cycle.
 */
export const escapeJson = (value: unknown): string => JSON.stringify(value);

/**
 * Apply the configured escape mode. Identity for `'none'`, falls
 * through to the matching helper otherwise.
 *
 * @param mode  Active escape mode.
 * @param value Text or value to escape.
 * @returns The escaped string.
 */
export const applyEscape = (mode: EscapeMode, value: string): string => {
  switch (mode) {
    case 'none':
      return value;
    case 'markdown':
      return escapeMarkdown(value);
    case 'json':
      return escapeJson(value);
  }
};
