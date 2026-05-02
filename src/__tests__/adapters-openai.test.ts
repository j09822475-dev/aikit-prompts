import { describe, expect, it } from 'vitest';
import { toOpenAI } from '../adapters/openai/index.js';
import { prompt } from '../core/prompt.js';
import { block } from '../core/block.js';
import { compose } from '../core/compose.js';
import { tool } from '../core/tool.js';
import { VariableError } from '../errors/variable-error.js';
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

describe('toOpenAI — single PromptDefinition', () => {
  it('should wrap the rendered string in a single user message', () => {
    const greet = prompt('greet').template('Hi {{name}}').build();
    const out = toOpenAI(greet, { name: 'Alice' });
    expect(out.messages).toEqual([{ role: 'user', content: 'Hi Alice' }]);
    expect(out.tools).toBeUndefined();
    expect(out.response_format).toBeUndefined();
  });
});

describe('toOpenAI — Composition', () => {
  it('should map blocks to OpenAI ChatMessage format preserving role', () => {
    const sys = block('system').template('You are helpful').build();
    const user = block('user').template('Hello {{name}}').build();
    const c = compose([sys, user]);
    const out = toOpenAI(c, { name: 'Alice' });
    expect(out.messages).toEqual([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello Alice' },
    ]);
  });

  it('should emit a function-typed tool entry for each tool in the composition', () => {
    const t = tool({
      name: 'search',
      description: 'web search',
      parameters: { type: 'object', properties: { q: { type: 'string' } } },
    });
    const c = compose([], { tools: [t] });
    const out = toOpenAI(c, {});
    expect(out.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'search',
          description: 'web search',
          parameters: {
            type: 'object',
            properties: { q: { type: 'string' } },
          },
        },
      },
    ]);
  });

  it('should emit a json_schema response_format when responseSchema is present', () => {
    const c = compose([], {
      id: 'my-id',
      responseSchema: { type: 'object' },
    });
    const out = toOpenAI(c, {});
    expect(out.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'my-id',
        schema: { type: 'object' },
        strict: true,
      },
    });
  });

  it('should default the response_format name to "response" when id is omitted', () => {
    const c = compose([], { responseSchema: { type: 'object' } });
    const out = toOpenAI(c, {});
    expect(out.response_format?.json_schema.name).toBe('response');
  });

  it('should compute a prompt_cache_key from the prefix when a cache breakpoint exists', () => {
    const sys = block('system').template('preamble').cacheBreakpoint().build();
    const user = block('user').template('q').build();
    const c = compose([sys, user]);
    const out = toOpenAI(c, {});
    expect(typeof out.prompt_cache_key).toBe('string');
    expect(out.prompt_cache_key?.length).toBeGreaterThan(0);
  });

  it('should omit prompt_cache_key when no breakpoint exists', () => {
    const c = compose([block('user').template('hi').build()]);
    const out = toOpenAI(c, {});
    expect(out.prompt_cache_key).toBeUndefined();
  });

  it('should omit prompt_cache_key when cache option is off', () => {
    const sys = block('system').template('p').cacheBreakpoint().build();
    const c = compose([sys], { cache: 'off' });
    const out = toOpenAI(c, {});
    expect(out.prompt_cache_key).toBeUndefined();
  });

  it('should map multimodal content arrays through messageContent', () => {
    const composition = fakeComposition([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'image', imageUrl: 'http://x/img.png' },
        ],
      },
    ]);
    const out = toOpenAI(composition, {});
    expect(out.messages[0]?.content).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'image_url', image_url: { url: 'http://x/img.png' } },
    ]);
  });

  it('should preserve toolCallId on tool-role messages', () => {
    const composition = fakeComposition([
      { role: 'tool', content: 'result', toolCallId: 'call-1', name: 't' },
    ]);
    const out = toOpenAI(composition, {});
    expect(out.messages[0]).toEqual({
      role: 'tool',
      content: 'result',
      name: 't',
      tool_call_id: 'call-1',
    });
  });

  it('should throw VariableError when a tool message lacks toolCallId', () => {
    const composition = fakeComposition([
      { role: 'tool', content: 'result' },
    ]);
    expect(() => toOpenAI(composition, {})).toThrow(VariableError);
  });
});
