import { describe, expect, it } from 'vitest';
import { memorySource } from '../sources/memory.js';
import { prompt } from '../core/prompt.js';

describe('memorySource', () => {
  it('should resolve load() with the supplied records', async () => {
    const records = [prompt('p').version('1.0.0').template('hi').build().toJSON()];
    const src = memorySource(records);
    const out = await src.load();
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('p');
  });

  it('should provide a no-op subscribe that returns a no-op unsubscribe', () => {
    const src = memorySource([]);
    const unsub = src.subscribe?.(() => undefined);
    expect(typeof unsub).toBe('function');
    expect(() => unsub?.()).not.toThrow();
  });

  it('should default the source name to a memory:n style identifier', () => {
    const src = memorySource([]);
    expect(src.name).toMatch(/^memory:\d+$/);
  });

  it('should accept an explicit name option', () => {
    const src = memorySource([], 'my-memory');
    expect(src.name).toBe('my-memory');
  });

  it('should throw when records contain an invalid entry', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      memorySource([{ id: 'p' } as any]),
    ).toThrow();
  });
});
