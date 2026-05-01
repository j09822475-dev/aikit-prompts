/**
 * Local re-typed views of the shapes we emit. Adapters never import the
 * provider SDK at runtime — these types match the SDK's structural
 * contract closely enough that callers can pass our output directly to
 * `openai.chat.completions.create({ model, ...params })`.
 */

export interface OpenAITextPart {
  readonly type: 'text';
  readonly text: string;
}

export interface OpenAIImagePart {
  readonly type: 'image_url';
  readonly image_url: { readonly url: string };
}

export type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;

export interface OpenAIChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | readonly OpenAIContentPart[];
  readonly name?: string;
  readonly tool_call_id?: string;
}

export interface OpenAIToolParam {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

export interface OpenAIResponseFormat {
  readonly type: 'json_schema';
  readonly json_schema: {
    readonly name: string;
    readonly schema: Readonly<Record<string, unknown>>;
    readonly strict?: boolean;
  };
}
