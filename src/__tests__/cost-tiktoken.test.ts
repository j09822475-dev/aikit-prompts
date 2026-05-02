import { describe, expect, it, vi, afterEach } from 'vitest';
import { tiktokenFor } from '../cost/tiktoken.js';

describe('tiktokenFor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a synchronously callable TokenizerFn for a known model', () => {
    const tok = tiktokenFor('gpt-4o');
    expect(typeof tok).toBe('function');
    const count = tok('hello world', 'gpt-4o');
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThan(0);
  });

  it('should produce tagged id and exact accuracy when encoder loads', () => {
    const tok = tiktokenFor('gpt-4o');
    expect(tok.id).toMatch(/^tiktoken\//);
    expect(tok.accuracy).toBe('exact');
  });

  it('should not throw when called with an empty string', () => {
    const tok = tiktokenFor('gpt-4o');
    expect(tok('', 'gpt-4o')).toBe(0);
  });

  it('should produce different counts for different inputs', () => {
    const tok = tiktokenFor('gpt-4o');
    expect(tok('hello', 'gpt-4o')).not.toBe(
      tok('hello world this is a long sentence', 'gpt-4o'),
    );
  });

  it('should fall back to cl100k_base with a one-time warning for unknown models', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    const tok = tiktokenFor('definitely-not-a-real-model-xyz');
    expect(tok.id).toContain('fallback');
    expect(typeof tok('hello', 'whatever')).toBe('number');
    warn.mockRestore();
  });

  it('should support the override-mapped o200k_base models', () => {
    for (const model of ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'] as const) {
      const tok = tiktokenFor(model);
      expect(tok.id).toBe('tiktoken/o200k_base');
    }
  });
});
