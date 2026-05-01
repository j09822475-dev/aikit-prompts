/**
 * Local re-typed views of `@langchain/core` BaseMessage shapes. Adapter
 * uses `import type` only — the runtime output is a plain object that
 * matches the structural contract.
 */

export type LangChainMessageType =
  | 'system'
  | 'human'
  | 'ai'
  | 'tool'
  | 'function';

export interface LangChainMessage {
  readonly _getType: () => LangChainMessageType;
  readonly content: string | readonly unknown[];
  readonly additional_kwargs: Readonly<Record<string, unknown>>;
  readonly name?: string;
  readonly tool_call_id?: string;
}
