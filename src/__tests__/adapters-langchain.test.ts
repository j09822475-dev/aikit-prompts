import { describe, expect, it } from 'vitest';
import { toLangChain } from '../adapters/langchain/index.js';
import { prompt } from '../core/prompt.js';
import { block } from '../core/block.js';
import { compose } from '../core/compose.js';
import type { ChatMessage, Composition } from '../core/types.js';

const fakeComposition = (
  messages: readonly ChatMessage[],
): Composition<Record<string, unknown>> =>
  ({
    blocks: [],
    tools: [],
    cache: 'auto',
    render: (): readonly ChatMessage[] => messages,
    tryRender: () => ({ ok: true, value: messages }),
    renderText: () => '',
    variables: () => [],
  }) as unknown as Composition<Record<string, unknown>>;

describe('toLangChain — single PromptDefinition', () => {
  it('should produce a single human message via _getType', () => {
    const greet = prompt('greet').template('Hi {{name}}').build();
    const out = toLangChain(greet, { name: 'A' });
    expect(out).toHaveLength(1);
    expect(out[0]?._getType()).toBe('human');
    expect(out[0]?.content).toBe('Hi A');
  });
});

describe('toLangChain — Composition', () => {
  it('should map every chat role to its LangChain counterpart', () => {
    const sys = block('system').template('You are').build();
    const user = block('user').template('Q').build();
    const ai = block('assistant').template('A').build();
    const c = compose([sys, user, ai]);
    const out = toLangChain(c, {});
    expect(out.map((m) => m._getType())).toEqual(['system', 'human', 'ai']);
  });

  it('should map tool_call_id and name onto the message when present', () => {
    const composition = fakeComposition([
      { role: 'tool', content: 'r', toolCallId: 'c1', name: 't' },
    ]);
    const out = toLangChain(composition, {});
    expect(out[0]?.tool_call_id).toBe('c1');
    expect(out[0]?.name).toBe('t');
    expect(out[0]?._getType()).toBe('tool');
  });

  it('should add providerMetadata to additional_kwargs when cacheControl is set', () => {
    const composition = fakeComposition([
      { role: 'user', content: 'hi', cacheControl: 'ephemeral' },
    ]);
    const out = toLangChain(composition, {});
    expect(out[0]?.additional_kwargs).toEqual({
      providerMetadata: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    });
  });

  it('should leave additional_kwargs empty when no cache hint is present', () => {
    const composition = fakeComposition([
      { role: 'user', content: 'hi' },
    ]);
    const out = toLangChain(composition, {});
    expect(out[0]?.additional_kwargs).toEqual({});
  });

  it('should pass through multimodal text content as { type, text } objects', () => {
    const composition = fakeComposition([
      {
        role: 'user',
        content: [{ type: 'text', text: 'hi' }],
      },
    ]);
    const out = toLangChain(composition, {});
    expect(out[0]?.content).toEqual([{ type: 'text', text: 'hi' }]);
  });
});
