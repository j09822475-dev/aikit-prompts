import { describe, expect, it } from 'vitest';
import { toAISDK } from '../adapters/ai-sdk/index.js';
import { prompt } from '../core/prompt.js';
import { block } from '../core/block.js';
import { compose } from '../core/compose.js';
import { tool } from '../core/tool.js';
import type { ChatMessage, Composition } from '../core/types.js';

const fakeComposition = (
  messages: readonly ChatMessage[],
  extras: Partial<Composition<Record<string, unknown>>> = {},
): Composition<Record<string, unknown>> =>
  ({
    blocks: [],
    tools: [],
    cache: 'auto',
    render: (): readonly ChatMessage[] => messages,
    tryRender: () => ({ ok: true, value: messages }),
    renderText: () => '',
    variables: () => [],
    ...extras,
  }) as unknown as Composition<Record<string, unknown>>;

describe('toAISDK — single PromptDefinition', () => {
  it('should produce a single user CoreMessage with the rendered text', () => {
    const greet = prompt('greet').template('Hi {{name}}').build();
    const out = toAISDK(greet, { name: 'A' });
    expect(out.messages).toEqual([{ role: 'user', content: 'Hi A' }]);
  });
});

describe('toAISDK — Composition', () => {
  it('should map blocks to AI SDK CoreMessages preserving role and content', () => {
    const sys = block('system').template('You are helpful').build();
    const user = block('user').template('Hi').build();
    const c = compose([sys, user]);
    const out = toAISDK(c, {});
    expect(out.messages).toEqual([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hi' },
    ]);
  });

  it('should emit tools as a name-keyed record with description and parameters', () => {
    const t = tool({
      name: 'search',
      description: 'search the web',
      parameters: { type: 'object' },
    });
    const c = compose([], { tools: [t] });
    const out = toAISDK(c, {});
    expect(out.tools).toEqual({
      search: { description: 'search the web', parameters: { type: 'object' } },
    });
  });

  it('should expose responseSchema via experimental_output', () => {
    const c = compose([], { responseSchema: { type: 'object' } });
    const out = toAISDK(c, {});
    expect(out.experimental_output).toEqual({ schema: { type: 'object' } });
  });

  it('should attach providerOptions when cache=auto and any breakpoint is present', () => {
    const sys = block('system').template('p').cacheBreakpoint().build();
    const c = compose([sys]);
    const out = toAISDK(c, {});
    expect(out.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
      openai: { cacheKey: 'auto' },
    });
  });

  it('should not attach providerOptions when no breakpoint is present', () => {
    const c = compose([block('system').template('p').build()]);
    const out = toAISDK(c, {});
    expect(out.providerOptions).toBeUndefined();
  });

  it('should not attach providerOptions when cache=off', () => {
    const sys = block('system').template('p').cacheBreakpoint().build();
    const c = compose([sys], { cache: 'off' });
    const out = toAISDK(c, {});
    expect(out.providerOptions).toBeUndefined();
  });

  it('should map text and image multimodal parts to AI SDK shapes', () => {
    const composition = fakeComposition([
      {
        role: 'user',
        content: [
          { type: 'text', text: 't' },
          { type: 'image', imageUrl: 'http://x', mimeType: 'image/png' },
        ],
      },
    ]);
    const out = toAISDK(composition, {});
    expect(out.messages[0]?.content).toEqual([
      { type: 'text', text: 't' },
      { type: 'image', image: 'http://x', mimeType: 'image/png' },
    ]);
  });

  it('should map tool_use parts to tool-call', () => {
    const composition = fakeComposition([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            toolCallId: 'c1',
            toolName: 'search',
            input: { q: 'hi' },
          },
        ],
      },
    ]);
    const out = toAISDK(composition, {});
    expect(out.messages[0]?.content).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'search',
        args: { q: 'hi' },
      },
    ]);
  });

  it('should map tool_result parts to tool-result with isError when present', () => {
    const composition = fakeComposition([
      {
        role: 'tool',
        toolCallId: 'c',
        content: [
          {
            type: 'tool_result',
            toolCallId: 'c',
            content: 'r',
            isError: true,
          },
        ],
      },
    ]);
    const out = toAISDK(composition, {});
    expect(out.messages[0]?.content).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'c',
        toolName: '',
        result: 'r',
        isError: true,
      },
    ]);
  });

  it('should map images without mimeType (omitting the field)', () => {
    const composition = fakeComposition([
      {
        role: 'user',
        content: [{ type: 'image', imageUrl: 'http://x' }],
      },
    ]);
    const out = toAISDK(composition, {});
    expect(out.messages[0]?.content).toEqual([
      { type: 'image', image: 'http://x' },
    ]);
  });
});
