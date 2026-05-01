import type {
  ChatMessage,
  Composition,
  PromptDefinition,
} from '../../core/types.js';
import type { LangChainMessage, LangChainMessageType } from './types.js';

export type { LangChainMessage, LangChainMessageType };

const isComposition = <TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
): src is Composition<TVars> =>
  Array.isArray((src as Composition<TVars>).blocks);

const roleToType: Record<ChatMessage['role'], LangChainMessageType> = {
  system: 'system',
  user: 'human',
  assistant: 'ai',
  tool: 'tool',
};

const toLangChainMessage = (m: ChatMessage): LangChainMessage => {
  const type = roleToType[m.role];
  const content =
    typeof m.content === 'string'
      ? m.content
      : m.content.map((p) =>
          p.type === 'text' ? { type: 'text', text: p.text } : p,
        );

  const additional_kwargs: Record<string, unknown> = {};
  if (m.cacheControl !== undefined) {
    additional_kwargs['providerMetadata'] = {
      anthropic: { cacheControl: { type: 'ephemeral' } },
    };
  }

  return {
    _getType: (): LangChainMessageType => type,
    content,
    additional_kwargs,
    ...(m.name !== undefined ? { name: m.name } : {}),
    ...(m.toolCallId !== undefined ? { tool_call_id: m.toolCallId } : {}),
  };
};

/**
 * Translate a `PromptDefinition` or `Composition` into LangChain
 * `BaseMessage`-shaped objects.
 *
 * The adapter does not import `@langchain/core` at runtime — the output
 * is a plain JS object structured to match the SDK's structural
 * contract. Type-checking against the SDK requires the peer dep.
 *
 * @param src  The prompt or composition to render.
 * @param vars Required-keys input matching `src`'s `TVars`.
 * @returns Array of LangChain-shaped messages.
 *
 * @throws {VariableError} when required vars are missing.
 */
export function toLangChain<TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
  vars: TVars,
): readonly LangChainMessage[] {
  if (!isComposition(src)) {
    return [
      toLangChainMessage({ role: 'user', content: src.render(vars) }),
    ];
  }
  return src.render(vars).map(toLangChainMessage);
}
