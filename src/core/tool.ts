import { ToolSchemaError } from '../errors/misc-errors.js';
import type { JSONSchema, Tool, ToolDefinition } from './types.js';

/**
 * Define a tool / function the LLM can call. Distinct from
 * `block('tool')`, which represents a tool *result* turn in the
 * conversation.
 *
 * `parameters` is a plain JSON Schema object. Bring-your-own validation:
 * Zod (`zodToJsonSchema(schema)`), Valibot, Effect Schema, or
 * hand-written JSON Schema all work — this lib is provider-agnostic and
 * does not couple to a schema library.
 *
 * @param def Tool definition: name, description, JSON-Schema parameters.
 * @returns The frozen `Tool` object adapters consume.
 *
 * @throws {ToolSchemaError} when `parameters` is not an `'object'` schema.
 *
 * @example
 * const search = tool({
 *   name: 'web_search',
 *   description: 'Search the web.',
 *   parameters: {
 *     type: 'object',
 *     properties: { query: { type: 'string' } },
 *     required: ['query'],
 *   },
 * });
 */
export function tool<TName extends string, TParams = unknown>(
  def: ToolDefinition<TName, TParams>,
): Tool<TName, TParams> {
  if (typeof def.name !== 'string' || def.name.length === 0) {
    throw new ToolSchemaError(
      `tool() requires a non-empty 'name'`,
      def.name as string | undefined,
    );
  }
  if (typeof def.description !== 'string') {
    throw new ToolSchemaError(
      `tool('${def.name}') requires a 'description' string`,
      def.name,
    );
  }
  validateToolSchema(def.parameters, def.name);

  return Object.freeze({
    name: def.name,
    description: def.description,
    parameters: def.parameters,
  }) as Tool<TName, TParams>;
}

/**
 * Validate that a JSON Schema is a top-level object schema, which is
 * the only shape OpenAI and Anthropic accept for tool parameters and
 * structured outputs.
 *
 * @param schema   JSON Schema to validate.
 * @param toolName Name of the tool the schema belongs to (for error context).
 *
 * @throws {ToolSchemaError} when the schema is missing or has the wrong root type.
 */
export const validateToolSchema = (
  schema: JSONSchema,
  toolName: string,
): void => {
  if (typeof schema !== 'object' || schema === null) {
    throw new ToolSchemaError(
      `tool('${toolName}').parameters must be a JSON Schema object`,
      toolName,
    );
  }
  const rootType = (schema as { type?: unknown }).type;
  if (rootType !== 'object') {
    throw new ToolSchemaError(
      `tool('${toolName}').parameters must have type: 'object' (got ${
        typeof rootType === 'string' ? `'${rootType}'` : String(rootType)
      })`,
      toolName,
    );
  }
};
