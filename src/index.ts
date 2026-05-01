/**
 * @aikit/prompts — root barrel.
 *
 * Re-exports the core API only. Versioning, A/B testing, cost
 * estimation, hot-reload sources, and provider adapters live behind
 * dedicated subpaths so `import` boundaries match the tree-shaking
 * layout (`@aikit/prompts/versioning`, `/testing`, `/cost`, `/sources`,
 * `/adapters/<provider>`, `/template-extras`, `/errors`).
 */

export { prompt, fromJSON, type PromptBuilder } from './core/prompt.js';
export { block, type BlockBuilder } from './core/block.js';
export { tool } from './core/tool.js';
export { compose } from './core/compose.js';
export {
  compileTemplate,
  extract,
  registerDirectiveRenderer,
} from './core/template.js';

export type {
  Block,
  ChatMessage,
  ComposeOptions,
  Composition,
  JSONSchema,
  MultimodalPart,
  PromptDefinition,
  PromptDefinitionJson,
  RenderOptions,
  Role,
  Tool,
  ToolDefinition,
} from './core/types.js';

export type { Result } from './types/result.js';
export { isOk, isErr, ok, err } from './types/result.js';
export type { ToolCall } from './types/message.js';
export type { ExtractVariables, TypeOf, Trim } from './types/extract-vars.js';
export type { InputShape, Prettify } from './types/input-shape.js';
export type { RemainingInput, UnionToIntersection } from './types/partial-vars.js';

export {
  PromptError,
  type ErrorCode,
} from './errors/base.js';
