import { describe, expect, it, vi } from 'vitest';
import { block } from '../core/block.js';
import { compose } from '../core/compose.js';
import { tool } from '../core/tool.js';
import { ToolSchemaError } from '../errors/misc-errors.js';
import { VariableError } from '../errors/variable-error.js';

describe('compose()', () => {
  it('should produce a frozen Composition with the supplied blocks and tools', () => {
    const sys = block('system').template('You are {{role}}').build();
    const user = block('user').template('Q: {{q}}').build();
    const t = tool({
      name: 't1',
      description: 'd',
      parameters: { type: 'object' },
    });
    const c = compose([sys, user], { id: 'chat', tools: [t] });
    expect(c.id).toBe('chat');
    expect(c.blocks).toHaveLength(2);
    expect(c.tools).toHaveLength(1);
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('should render blocks into a chat-message array honoring role and order', () => {
    const sys = block('system').template('You are {{role}}').build();
    const user = block('user').template('Hi, {{q}}').build();
    const c = compose([sys, user]);
    const messages = c.render({ role: 'admin', q: 'how' });
    expect(messages).toEqual([
      { role: 'system', content: 'You are admin' },
      { role: 'user', content: 'Hi, how' },
    ]);
  });

  it('should expand examples into alternating user/assistant turns before the block', () => {
    const ex = block('user')
      .examples([
        { user: 'hi', assistant: 'hello' },
        { user: 'bye', assistant: 'goodbye' },
      ])
      .template('Now: {{q}}')
      .build();
    const c = compose([ex]);
    const messages = c.render({ q: 'help' });
    expect(messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'bye' },
      { role: 'assistant', content: 'goodbye' },
      { role: 'user', content: 'Now: help' },
    ]);
  });

  it('should attach cacheControl on a block flagged as cacheBreakpoint', () => {
    const b = block('system').template('preamble').cacheBreakpoint().build();
    const c = compose([b]);
    const messages = c.render({});
    expect(messages[0]).toMatchObject({
      role: 'system',
      content: 'preamble',
      cacheControl: 'ephemeral',
    });
  });

  it('should drop cacheControl when cache option is set to off', () => {
    const b = block('system').template('preamble').cacheBreakpoint().build();
    const c = compose([b], { cache: 'off' });
    const messages = c.render({});
    expect(messages[0]).toMatchObject({
      role: 'system',
      content: 'preamble',
    });
    expect((messages[0] as { cacheControl?: string }).cacheControl).toBeUndefined();
  });

  it('should apply cacheBreakpoint to the previous message when block has no template', () => {
    const sys = block('system').template('hello').build();
    const marker = block('system').cacheBreakpoint().build();
    const c = compose([sys, marker]);
    const messages = c.render({});
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ cacheControl: 'ephemeral' });
  });

  it('should warn once when more than 4 cache breakpoints are declared', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    const blocks = Array.from({ length: 6 }, (_, i) =>
      block('system').template(`b${i}`).cacheBreakpoint().build(),
    );
    compose(blocks);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should honor only the last 4 cache breakpoints when over the cap', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    const blocks = Array.from({ length: 6 }, (_, i) =>
      block('system').template(`b${i}`).cacheBreakpoint().build(),
    );
    const c = compose(blocks);
    const messages = c.render({});
    const cached = messages.filter(
      (m) => (m as { cacheControl?: string }).cacheControl === 'ephemeral',
    );
    expect(cached).toHaveLength(4);
    warn.mockRestore();
  });

  it('should aggregate variables across all blocks in declaration order with no duplicates', () => {
    const a = block('system').template('{{x}} {{y}}').build();
    const b = block('user').template('{{y}} {{z}}').build();
    const c = compose([a, b]);
    expect(c.variables()).toEqual(['x', 'y', 'z']);
  });

  it('should throw ToolSchemaError when two tools share the same name', () => {
    const t1 = tool({
      name: 'dup',
      description: '',
      parameters: { type: 'object' },
    });
    const t2 = tool({
      name: 'dup',
      description: '',
      parameters: { type: 'object' },
    });
    expect(() => compose([], { tools: [t1, t2] })).toThrowError(ToolSchemaError);
  });

  it('should expose tryRender returning err when a required variable is missing', () => {
    const a = block('system').template('{{missing}}').build();
    const c = compose([a]);
    const r = c.tryRender({} as { missing: string });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(VariableError);
  });

  it('should expose tryRender returning ok=true on success', () => {
    const a = block('system').template('{{x}}').build();
    const c = compose([a]);
    const r = c.tryRender({ x: 'hi' });
    expect(r.ok).toBe(true);
  });

  it('should concatenate messages into a string via renderText with double-newline separators', () => {
    const sys = block('system').template('preamble').build();
    const user = block('user').template('hello').build();
    const c = compose([sys, user]);
    expect(c.renderText({})).toBe('preamble\n\nhello');
  });

  it('should keep responseSchema and version when supplied via options', () => {
    const c = compose([], {
      version: '1.0.0',
      responseSchema: { type: 'object' },
    });
    expect(c.version).toBe('1.0.0');
    expect(c.responseSchema).toEqual({ type: 'object' });
  });

  it('should default cache to auto when option not supplied', () => {
    const c = compose([]);
    expect(c.cache).toBe('auto');
  });
});
