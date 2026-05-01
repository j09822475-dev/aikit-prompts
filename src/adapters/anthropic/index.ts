import { VariableError } from '../../errors/variable-error.js';
import type {
  ChatMessage,
  Composition,
  PromptDefinition,
} from '../../core/types.js';
import type {
  AnthropicMessage,
  AnthropicTextBlock,
  AnthropicToolParam,
} from './types.js';

export type {
  AnthropicMessage,
  AnthropicTextBlock,
  AnthropicToolParam,
};

const isComposition = <TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
): src is Composition<TVars> =>
  Array.isArray((src as Composition<TVars>).blocks);

let warnedOnMultiSystem = false;
const warnMultiSystem = (): void => {
  if (warnedOnMultiSystem) return;
  warnedOnMultiSystem = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[@aikit/prompts/anthropic] composition has multiple system blocks — ` +
      `concatenated with '\\n\\n'. Anthropic supports a single system field.`,
  );
};

const toUserMessageContent = (
  m: ChatMessage,
  cache: 'auto' | 'off',
): string | readonly AnthropicTextBlock[] => {
  if (typeof m.content === 'string') {
    if (cache === 'auto' && m.cacheControl === 'ephemeral') {
      return [
        {
          type: 'text',
          text: m.content,
          cache_control: { type: 'ephemeral' },
        },
      ];
    }
    return m.content;
  }
  const blocks: AnthropicTextBlock[] = [];
  for (const p of m.content) {
    if (p.type === 'text') blocks.push({ type: 'text', text: p.text });
  }
  if (cache === 'auto' && m.cacheControl === 'ephemeral' && blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    if (last !== undefined) {
      blocks[blocks.length - 1] = {
        ...last,
        cache_control: { type: 'ephemeral' },
      };
    }
  }
  return blocks;
};

/**
 * Translate a `PromptDefinition` or `Composition` into the shape
 * accepted by Anthropic's Messages API
 * (`anthropic.messages.create({...})`).
 *
 * System messages are concatenated into the top-level `system` field;
 * cache breakpoints translate into per-block `cache_control: { type:
 * 'ephemeral' }`. When two or more system blocks exist a one-time
 * warning is emitted.
 *
 * @param src  The prompt or composition to render.
 * @param vars Required-keys input matching `src`'s `TVars`.
 * @returns `{ system?, messages, tools? }`.
 *
 * @throws {VariableError} when required vars are missing or a `tool` role
 *   message lacks a `toolCallId`.
 */
export function toAnthropic<TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
  vars: TVars,
): {
  system?: string | readonly AnthropicTextBlock[];
  messages: readonly AnthropicMessage[];
  tools?: readonly AnthropicToolParam[];
} {
  if (!isComposition(src)) {
    return {
      messages: [{ role: 'user', content: src.render(vars) }],
    };
  }

  const messages = src.render(vars);
  const cache = src.cache;

  const systemMessages: ChatMessage[] = [];
  const out: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemMessages.push(m);
      continue;
    }
    if (m.role === 'tool') {
      if (m.toolCallId === undefined) {
        throw new VariableError(
          'VARIABLE_TYPE_MISMATCH',
          `Anthropic adapter requires every 'tool' role message to have a 'toolCallId'`,
        );
      }
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId,
            content:
              typeof m.content === 'string'
                ? m.content
                : '[multimodal tool result]',
          },
        ],
      });
      continue;
    }
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({
        role: m.role,
        content: toUserMessageContent(m, cache),
      });
    }
  }

  let system: string | readonly AnthropicTextBlock[] | undefined;
  if (systemMessages.length === 1) {
    const only = systemMessages[0];
    if (only !== undefined) {
      system =
        cache === 'auto' && only.cacheControl === 'ephemeral'
          ? [
              {
                type: 'text',
                text: typeof only.content === 'string' ? only.content : '',
                cache_control: { type: 'ephemeral' },
              },
            ]
          : typeof only.content === 'string'
            ? only.content
            : '';
    }
  } else if (systemMessages.length > 1) {
    warnMultiSystem();
    const blocks: AnthropicTextBlock[] = [];
    for (const m of systemMessages) {
      const text = typeof m.content === 'string' ? m.content : '';
      const block: AnthropicTextBlock =
        cache === 'auto' && m.cacheControl === 'ephemeral'
          ? { type: 'text', text, cache_control: { type: 'ephemeral' } }
          : { type: 'text', text };
      blocks.push(block);
    }
    system = blocks;
  }

  const result: {
    system?: string | readonly AnthropicTextBlock[];
    messages: readonly AnthropicMessage[];
    tools?: readonly AnthropicToolParam[];
  } = { messages: out };
  if (system !== undefined) result.system = system;
  if (src.tools.length > 0) {
    result.tools = src.tools.map<AnthropicToolParam>((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }
  return result;
}
