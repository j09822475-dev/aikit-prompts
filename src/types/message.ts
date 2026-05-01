import type { Role } from './role.js';

/**
 * Multimodal content part (text + image + tool-result blocks).
 * Mirrors the OpenAI / Anthropic content-array shape so adapters can
 * pass-through with minimal massaging.
 */
export type MultimodalPart =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'image';
      /** Either a URL or a base64-encoded data URL. */
      readonly imageUrl: string;
      readonly mimeType?: string;
    }
  | {
      readonly type: 'tool_use';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly input: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: 'tool_result';
      readonly toolCallId: string;
      readonly content: string | readonly MultimodalPart[];
      readonly isError?: boolean;
    };

/**
 * A single chat-style message produced by `Composition.render()`.
 *
 * Adapters translate this into provider-specific shapes (OpenAI
 * `ChatCompletionMessageParam`, Anthropic `MessageParam`, AI SDK
 * `CoreMessage`, LangChain `BaseMessage`).
 */
export interface ChatMessage {
  readonly role: Role;
  readonly content: string | readonly MultimodalPart[];
  /** Optional speaker name (e.g. for `tool` role: the tool function name). */
  readonly name?: string;
  /** Set on `tool` role — id of the call this message replies to. */
  readonly toolCallId?: string;
  /**
   * Set when this message ends a `cacheBreakpoint()`-bounded prefix.
   * Adapters translate to provider-specific cache hints.
   */
  readonly cacheControl?: 'ephemeral';
}

/**
 * A pending tool call emitted by the model. Surfaced through
 * `MultimodalPart` of type `'tool_use'` — kept here as a re-export
 * convenience for callers that want the standalone alias.
 */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}
