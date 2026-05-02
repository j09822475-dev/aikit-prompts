import { describe, expect, it } from 'vitest';
import { heuristicTokenizer } from '../cost/tokenizer.js';

describe('heuristicTokenizer', () => {
  it('should return 0 for an empty string', () => {
    expect(heuristicTokenizer('', 'any')).toBe(0);
  });

  it('should return ceil(length / 4) for non-empty input', () => {
    expect(heuristicTokenizer('a', 'm')).toBe(1);
    expect(heuristicTokenizer('abcd', 'm')).toBe(1);
    expect(heuristicTokenizer('abcde', 'm')).toBe(2);
    expect(heuristicTokenizer('a'.repeat(100), 'm')).toBe(25);
  });

  it('should expose id and accuracy tags', () => {
    expect(heuristicTokenizer.id).toBe('heuristic-4cpt');
    expect(heuristicTokenizer.accuracy).toBe('rough');
  });
});
