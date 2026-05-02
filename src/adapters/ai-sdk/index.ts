import type {
  ChatMessage,
  Composition,
  PromptDefinition,
  JSONSchema,
  MultimodalPart,
} from '../../core/types.js';
import type {
  AISDKCoreMessage,
  AISDKContentPart,
  AISDKToolDef,
} from './types.js';

export type { AISDKCoreMessage, AISDKContentPart, AISDKToolDef };

const isComposition = <TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
): src is Composition<TVars> =>
  Array.isArray((src as Composition<TVars>).blocks);

const toCorePart = (p: MultimodalPart): AISDKContentPart | undefined => {
  if (p.type === 'text') return { type: 'text', text: p.text };
  if (p.type === 'image') {
    return p.mimeType !== undefined
      ? { type: 'image', image: p.imageUrl, mimeType: p.mimeType }
      : { type: 'image', image: p.imageUrl };
  }
  if (p.type === 'tool_use')
    return {
      type: 'tool-call',
      toolCallId: p.toolCallId,
      toolName: p.toolName,
      args: p.input,
    };
  if (p.type === 'tool_result')
    return {
      type: 'tool-result',
      toolCallId: p.toolCallId,
      toolName: '',
      result: p.content,
      ...(p.isError !== undefined ? { isError: p.isError } : {}),
    };
  return undefined;
};

const toCoreMessage = (m: ChatMessage): AISDKCoreMessage => {
  if (typeof m.content === 'string') {
    return { role: m.role, content: m.content };
  }
  const parts: AISDKContentPart[] = [];
  for (const p of m.content) {
    const part = toCorePart(p);
    if (part) parts.push(part);
  }
  return { role: m.role, content: parts };
};

/**
 * Translate a `PromptDefinition` or `Composition` into Vercel AI SDK
 * inputs (`messages`, optional `tools`, structured `experimental_output`,
 * `providerOptions` carrying cache hints).
 *
 * @param src  The prompt or composition to render.
 * @param vars Required-keys input matching `src`'s `TVars`.
 * @returns `{ messages, tools?, experimental_output?, providerOptions? }`.
 *
 * @throws {VariableError} when required vars are missing.
 *
 * @example
 * import { generateText } from 'ai';
 * const args = toAISDK(chat, { question: 'Why TS?' });
 * await generateText({ model, ...args });
 */
export function toAISDK<TVars extends Record<string, unknown>>(
  src: PromptDefinition<TVars> | Composition<TVars>,
  vars: TVars,
): {
  messages: readonly AISDKCoreMessage[];
  tools?: Readonly<Record<string, AISDKToolDef>>;
  experimental_output?: { schema: JSONSchema };
  providerOptions?: Readonly<Record<string, unknown>>;
} {
  if (!isComposition(src)) {
    return {
      messages: [{ role: 'user', content: src.render(vars) }],
    };
  }

  const rendered = src.render(vars);
  let hasCache = false;
  const messages: AISDKCoreMessage[] = [];
  for (const m of rendered) {
    if (m.cacheControl === 'ephemeral') hasCache = true;
    messages.push(toCoreMessage(m));
  }

  const out: {
    messages: readonly AISDKCoreMessage[];
    tools?: Readonly<Record<string, AISDKToolDef>>;
    experimental_output?: { schema: JSONSchema };
    providerOptions?: Readonly<Record<string, unknown>>;
  } = { messages };

  if (src.tools.length > 0) {
    const tools: Record<string, AISDKToolDef> = {};
    for (const t of src.tools) {
      tools[t.name] = {
        description: t.description,
        parameters: t.parameters,
      };
    }
    out.tools = tools;
  }

  if (src.responseSchema) {
    out.experimental_output = { schema: src.responseSchema };
  }

  if (src.cache === 'auto' && hasCache) {
    out.providerOptions = {
      anthropic: { cacheControl: { type: 'ephemeral' } },
      openai: { cacheKey: 'auto' },
    };
  }

  return out;
}
