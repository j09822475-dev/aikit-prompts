/**
 * Local re-typed views of the Anthropic Messages API shapes we emit.
 * Adapters import the SDK only via `import type` (none here — these
 * are structural counterparts).
 */

export interface AnthropicCacheControl {
  readonly type: 'ephemeral';
}

export interface AnthropicTextBlock {
  readonly type: 'text';
  readonly text: string;
  readonly cache_control?: AnthropicCacheControl;
}

export interface AnthropicImageBlock {
  readonly type: 'image';
  readonly source: {
    readonly type: 'url' | 'base64';
    readonly media_type?: string;
    readonly data?: string;
    readonly url?: string;
  };
}

export interface AnthropicToolResultBlock {
  readonly type: 'tool_result';
  readonly tool_use_id: string;
  readonly content: string | readonly AnthropicTextBlock[];
  readonly is_error?: boolean;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolResultBlock;

export interface AnthropicMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly AnthropicContentBlock[];
}

export interface AnthropicToolParam {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Readonly<Record<string, unknown>>;
}
