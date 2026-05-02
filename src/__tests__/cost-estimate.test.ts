import { describe, expect, it } from 'vitest';
import { estimateCost, estimateTokens, roughCost } from '../cost/estimate.js';
import { prompt } from '../core/prompt.js';
import { block } from '../core/block.js';
import { compose } from '../core/compose.js';
import { CostError } from '../errors/cost-error.js';
import type { TokenizerFn } from '../cost/types.js';

const greet = prompt('greet').template('Hello {{name}}').build();

describe('estimateCost — happy path', () => {
  it('should compute input/output token counts and dollar costs for a known model', () => {
    const r = estimateCost({
      prompt: greet,
      vars: { name: 'Alice' },
      model: 'gpt-4o',
      expectedOutputTokens: 100,
    });
    expect(r.inputTokens).toBeGreaterThan(0);
    expect(r.outputTokens).toBe(100);
    expect(r.inputCostUSD).toBeGreaterThan(0);
    expect(r.outputCostUSD).toBeGreaterThan(0);
    expect(r.totalUSD).toBe(r.inputCostUSD + r.outputCostUSD);
    expect(r.currency).toBe('USD');
    expect(r.model).toBe('gpt-4o');
  });

  it('should default expectedOutputTokens to zero', () => {
    const r = estimateCost({
      prompt: greet,
      vars: { name: 'A' },
      model: 'gpt-4o',
    });
    expect(r.outputTokens).toBe(0);
    expect(r.outputCostUSD).toBe(0);
  });

  it('should use the heuristic tokenizer by default with rough accuracy tag', () => {
    const r = estimateCost({
      prompt: greet,
      vars: { name: 'Alice' },
      model: 'gpt-4o',
    });
    expect(r.tokenizer).toBe('heuristic-4cpt');
    expect(r.accuracy).toBe('rough');
  });

  it('should use a custom tokenizer when supplied', () => {
    const fakeTok: TokenizerFn = Object.assign(
      (_text: string, _model: string): number => 50,
      { id: 'fake', accuracy: 'exact' as const },
    );
    const r = estimateCost({
      prompt: greet,
      vars: { name: 'Alice' },
      model: 'gpt-4o',
      tokenizer: fakeTok,
    });
    expect(r.tokenizer).toBe('fake');
    expect(r.accuracy).toBe('exact');
    // 50 tokens + 4 overhead.
    expect(r.inputTokens).toBe(54);
  });

  it('should accept a Composition as the prompt argument', () => {
    const sys = block('system').template('You are helpful').build();
    const user = block('user').template('Question: {{q}}').build();
    const c = compose([sys, user]);
    const r = estimateCost({
      prompt: c,
      vars: { q: 'hi' },
      model: 'gpt-4o',
    });
    expect(r.inputTokens).toBeGreaterThan(0);
  });

  it('should expose roughCost as an alias of estimateCost', () => {
    expect(roughCost).toBe(estimateCost);
  });

  it('should include the pricing snapshot date in the result', () => {
    const r = estimateCost({
      prompt: greet,
      vars: { name: 'A' },
      model: 'gpt-4o',
    });
    expect(r.pricingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('estimateCost — errors', () => {
  it('should throw CostError when the model is unknown', () => {
    expect(() =>
      estimateCost({
        prompt: greet,
        vars: { name: 'Alice' },
        model: 'mystery-model',
      }),
    ).toThrow(CostError);
  });

  it('should throw CostError when expectedOutputTokens is negative', () => {
    expect(() =>
      estimateCost({
        prompt: greet,
        vars: { name: 'Alice' },
        model: 'gpt-4o',
        expectedOutputTokens: -1,
      }),
    ).toThrow(CostError);
  });

  it('should throw CostError when expectedOutputTokens is not finite', () => {
    expect(() =>
      estimateCost({
        prompt: greet,
        vars: { name: 'Alice' },
        model: 'gpt-4o',
        expectedOutputTokens: Infinity,
      }),
    ).toThrow(CostError);
  });

  it('should throw COST_INVALID_TOKEN_COUNT when tokenizer returns a negative number', () => {
    const bad: TokenizerFn = Object.assign(
      (): number => -5,
      { id: 'bad', accuracy: 'exact' as const },
    );
    let caught: CostError | undefined;
    try {
      estimateCost({
        prompt: greet,
        vars: { name: 'A' },
        model: 'gpt-4o',
        tokenizer: bad,
      });
    } catch (e) {
      caught = e as CostError;
    }
    expect(caught?.code).toBe('COST_INVALID_TOKEN_COUNT');
  });

  it('should wrap a tokenizer throw as COST_INVALID_TOKEN_COUNT with cause', () => {
    const cause = new Error('tokenizer crash');
    const throwing: TokenizerFn = Object.assign(
      (): number => {
        throw cause;
      },
      { id: 'thr', accuracy: 'exact' as const },
    );
    let caught: CostError | undefined;
    try {
      estimateCost({
        prompt: greet,
        vars: { name: 'A' },
        model: 'gpt-4o',
        tokenizer: throwing,
      });
    } catch (e) {
      caught = e as CostError;
    }
    expect(caught?.code).toBe('COST_INVALID_TOKEN_COUNT');
    expect(caught?.cause).toBe(cause);
  });
});

describe('estimateTokens', () => {
  it('should return token counts without requiring a model', () => {
    const r = estimateTokens({ prompt: greet, vars: { name: 'A' } });
    expect(r.inputTokens).toBeGreaterThan(0);
    expect(r.tokenizer).toBe('heuristic-4cpt');
    expect(r.accuracy).toBe('rough');
  });

  it('should accept a custom tokenizer', () => {
    const fake: TokenizerFn = Object.assign(
      (): number => 7,
      { id: 'fk', accuracy: 'exact' as const },
    );
    const r = estimateTokens({
      prompt: greet,
      vars: { name: 'A' },
      tokenizer: fake,
    });
    expect(r.tokenizer).toBe('fk');
    expect(r.accuracy).toBe('exact');
  });

  it('should fall back to "unknown" when tokenizer has no id tag', () => {
    const fake = ((): number => 1) as TokenizerFn;
    const r = estimateTokens({
      prompt: greet,
      vars: { name: 'A' },
      tokenizer: fake,
    });
    expect(r.tokenizer).toBe('unknown');
    expect(r.accuracy).toBe('rough');
  });
});
