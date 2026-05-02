import { describe, expect, it, vi } from 'vitest';
import { toAnthropic } from '../adapters/anthropic/index.js';
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

describe('toAnthropic — single PromptDefinition', () => {
  it('should wrap the rendered string into a single user message', () => {
    const greet = prompt('greet').template('Hi {{name}}').build();
    const out = toAnthropic(greet, { name: 'Alice' });
    expect(out.messages).toEqual([{ role: 'user', content: 'Hi Alice' }]);
    expect(out.system).toBeUndefined();
  });
});

describe('toAnthropic — Composition', () => {
  it('should hoist a single system block into the top-level system field', () => {
    const sys = block('system').template('You are helpful').build();
    const user = block('user').template('Hi {{name}}').build();
    const c = compose([sys, user]);
    const out = toAnthropic(c, { name: 'Alice' });
    expect(out.system).toBe('You are helpful');
    expect(out.messages).toEqual([{ role: 'user', content: 'Hi Alice' }]);
  });

  it('should attach cache_control on the system field when system has a cache breakpoint', () => {
    const sys = block('system').template('p').cacheBreakpoint().build();
    const c = compose([sys]);
    const out = toAnthropic(c, {});
    expect(Array.isArray(out.system)).toBe(true);
    if (Array.isArray(out.system)) {
      expect(out.system[0]).toMatchObject({
        type: 'text',
        text: 'p',
        cache_control: { type: 'ephemeral' },
      });
    }
  });

  it('should warn once and concatenate multiple system blocks into an array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    const c = compose([
      block('system').template('a').build(),
      block('system').template('b').build(),
    ]);
    const out = toAnthropic(c, {});
    expect(Array.isArray(out.system)).toBe(true);
    expect((out.system as Array<{ text: string }>).map((b) => b.text)).toEqual([
      'a',
      'b',
    ]);
    warn.mockRestore();
  });

  it('should map a tool-role message to a tool_result inside a user turn', () => {
    const composition = fakeComposition([
      { role: 'tool', content: 'r1', toolCallId: 'call-1' },
    ]);
    const out = toAnthropic(composition, {});
    expect(out.messages[0]).toMatchObject({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call-1',
          content: 'r1',
        },
      ],
    });
  });

  it('should throw VariableError when a tool message lacks toolCallId', () => {
    const composition = fakeComposition([
      { role: 'tool', content: 'r' },
    ]);
    expect(() => toAnthropic(composition, {})).toThrow(VariableError);
  });

  it('should serialize a multimodal user message to text-block array', () => {
    const composition = fakeComposition([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      },
    ]);
    const out = toAnthropic(composition, {});
    expect(out.messages[0]?.content).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ]);
  });

  it('should attach cache_control on the last text block of a multimodal user message', () => {
    const composition = fakeComposition([
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
        cacheControl: 'ephemeral',
      },
    ]);
    const out = toAnthropic(composition, {});
    const blocks = out.messages[0]?.content as Array<{
      cache_control?: { type: string };
    }>;
    expect(blocks[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('should drop cache_control entirely when cache=off on the composition', () => {
    const sys = block('system').template('p').cacheBreakpoint().build();
    const c = compose([sys], { cache: 'off' });
    const out = toAnthropic(c, {});
    expect(out.system).toBe('p');
  });

  it('should expose tools as input_schema-shaped Anthropic tool params', () => {
    const t = tool({
      name: 'search',
      description: 'd',
      parameters: { type: 'object' },
    });
    const c = compose([], { tools: [t] });
    const out = toAnthropic(c, {});
    expect(out.tools).toEqual([
      { name: 'search', description: 'd', input_schema: { type: 'object' } },
    ]);
  });

  it('should serialize a multimodal tool message into the placeholder string', () => {
    const composition = fakeComposition([
      {
        role: 'tool',
        toolCallId: 'c',
        content: [{ type: 'text', text: 'x' }],
      },
    ]);
    const out = toAnthropic(composition, {});
    const block0 = out.messages[0]?.content as Array<{
      content: string;
    }>;
    expect(block0[0]?.content).toBe('[multimodal tool result]');
  });
});
