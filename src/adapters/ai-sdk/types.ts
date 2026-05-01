/** Local re-typed views of Vercel AI SDK CoreMessage shapes. */

export interface AISDKTextPart {
  readonly type: 'text';
  readonly text: string;
}

export interface AISDKImagePart {
  readonly type: 'image';
  readonly image: string;
  readonly mimeType?: string;
}

export interface AISDKToolCallPart {
  readonly type: 'tool-call';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface AISDKToolResultPart {
  readonly type: 'tool-result';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: unknown;
  readonly isError?: boolean;
}

export type AISDKContentPart =
  | AISDKTextPart
  | AISDKImagePart
  | AISDKToolCallPart
  | AISDKToolResultPart;

export interface AISDKCoreMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | readonly AISDKContentPart[];
}

export interface AISDKToolDef {
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}
