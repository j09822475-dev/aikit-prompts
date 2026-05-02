import { VariableError } from '../../errors/variable-error.js';
import type {
  ChatMessage,
  Composition,
  PromptDefinition,
} from '../../core/types.js';
import { fnv1a32 } from '../../internal/hash.js';
import type {
  OpenAIChatMessage,
  OpenAIContentPart,
  OpenAIResponseFormat,
  OpenAIToolParam,
} from './types.js';

export type {
  OpenAIChatMessage,
  OpenAIContentPart,
  OpenAIResponseFormat,
  OpenAIToolParam,
};

const isComposition = <TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
): src is Composition<TVars> =>
  Array.isArray(
    (src as Composition<TVars>).blocks,
  );

const messageContent = (
  m: ChatMessage,
): string | readonly OpenAIContentPart[] => {
  if (typeof m.content === 'string') return m.content;
  const parts: OpenAIContentPart[] = [];
  for (const p of m.content) {
    if (p.type === 'text') parts.push({ type: 'text', text: p.text });
    else if (p.type === 'image')
      parts.push({ type: 'image_url', image_url: { url: p.imageUrl } });
  }
  return parts;
};

const toMessage = (m: ChatMessage): OpenAIChatMessage => {
  if (m.role === 'tool' && m.toolCallId === undefined) {
    throw new VariableError(
      'VARIABLE_TYPE_MISMATCH',
      `OpenAI adapter requires every 'tool' role message to have a 'toolCallId'`,
    );
  }
  return {
    role: m.role,
    content: messageContent(m),
    ...(m.name !== undefined ? { name: m.name } : {}),
    ...(m.toolCallId !== undefined ? { tool_call_id: m.toolCallId } : {}),
  };
};

const cachePrefixHash = (messages: readonly ChatMessage[]): string => {
  const upTo = messages.findIndex((m) => m.cacheControl === 'ephemeral');
  if (upTo < 0) return '';
  const prefix = messages
    .slice(0, upTo + 1)
    .map((m) =>
      typeof m.content === 'string'
        ? `${m.role}::${m.content}`
        : `${m.role}::[multimodal]`,
    )
    .join('\n');
  return fnv1a32(prefix).toString(16);
};

/**
 * Translate a `PromptDefinition` or `Composition` into the shape
 * accepted by `openai.chat.completions.create({...})`.
 *
 * The library never imports the OpenAI SDK at runtime — the return
 * value is a plain JS object structured to match the SDK's params.
 *
 * @param src  The prompt or composition to render.
 * @param vars Required-keys input matching `src`'s `TVars`.
 * @returns `{ messages, tools?, response_format?, prompt_cache_key? }`.
 *
 * @throws {VariableError} when required vars are missing or a `tool` role
 *   message lacks a `toolCallId`.
 *
 * @example
 * import OpenAI from 'openai';
 * const params = toOpenAI(chat, { question: 'Why TS?' });
 * await new OpenAI().chat.completions.create({ model: 'gpt-4o', ...params });
 */
export function toOpenAI<TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
  vars: TVars,
): {
  messages: readonly OpenAIChatMessage[];
  tools?: readonly OpenAIToolParam[];
  response_format?: OpenAIResponseFormat;
  prompt_cache_key?: string;
} {
  if (!isComposition(src)) {
    return {
      messages: [{ role: 'user', content: src.render(vars) }],
    };
  }

  const messages = src.render(vars);
  const out: {
    messages: readonly OpenAIChatMessage[];
    tools?: readonly OpenAIToolParam[];
    response_format?: OpenAIResponseFormat;
    prompt_cache_key?: string;
  } = {
    messages: messages.map(toMessage),
  };

  if (src.tools.length > 0) {
    out.tools = src.tools.map<OpenAIToolParam>((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  if (src.responseSchema) {
    out.response_format = {
      type: 'json_schema',
      json_schema: {
        name: src.id ?? 'response',
        schema: src.responseSchema,
        strict: true,
      },
    };
  }

  if (src.cache === 'auto') {
    const cacheKey = cachePrefixHash(messages);
    if (cacheKey.length > 0) out.prompt_cache_key = cacheKey;
  }

  return out;
}
