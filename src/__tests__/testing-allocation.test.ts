import { describe, expect, it } from 'vitest';
import { buildAllocation, pickVariant } from '../testing/allocation.js';
import { ABTestError } from '../errors/ab-test-error.js';
import { prompt } from '../core/prompt.js';

const v = (id: string, weight: number, body = 'x') => ({
  id,
  prompt: prompt(id).template(body).build(),
  weight,
});

describe('buildAllocation', () => {
  it('should produce ascending cumulative bucket boundaries that end at 1', () => {
    const allocation = buildAllocation([v('a', 50), v('b', 50)]);
    expect(allocation).toHaveLength(2);
    expect(allocation[0]?.id).toBe('a');
    expect(allocation[0]?.upperBound).toBeCloseTo(0.5);
    expect(allocation[1]?.id).toBe('b');
    expect(allocation[1]?.upperBound).toBe(1);
  });

  it('should reserve the holdout fraction at the bottom of the [0, 1) interval', () => {
    const allocation = buildAllocation([v('a', 100)], 0.2);
    expect(allocation[0]?.upperBound).toBe(1);
    // The first non-holdout bucket starts at 0.2, ends at 1.
  });

  it('should throw ABTestError when no variants are supplied', () => {
    expect(() => buildAllocation([])).toThrow(ABTestError);
  });

  it('should throw ABTestError when holdout is out of range', () => {
    expect(() => buildAllocation([v('a', 50)], -0.1)).toThrow(ABTestError);
    expect(() => buildAllocation([v('a', 50)], 1.5)).toThrow(ABTestError);
  });

  it('should throw ABTestError when two variants share the same id', () => {
    expect(() => buildAllocation([v('a', 50), v('a', 50)])).toThrow(
      ABTestError,
    );
  });

  it('should throw ABTestError when a weight is not a positive finite number', () => {
    expect(() => buildAllocation([v('a', 0)])).toThrow(ABTestError);
    expect(() => buildAllocation([v('a', -10)])).toThrow(ABTestError);
    expect(() => buildAllocation([v('a', NaN)])).toThrow(ABTestError);
  });

  it('should throw ABTestError when total weight exceeds 100', () => {
    expect(() => buildAllocation([v('a', 60), v('b', 60)])).toThrow(
      ABTestError,
    );
  });
});

describe('pickVariant', () => {
  it('should pick the variant whose bucket interval contains the value', () => {
    const allocation = buildAllocation([v('a', 50), v('b', 50)]);
    expect(pickVariant(0.1, allocation)).toBe('a');
    expect(pickVariant(0.6, allocation)).toBe('b');
  });

  it('should fall through to the last variant when value lands in a tail beyond the last upperBound', () => {
    const allocation = buildAllocation([v('a', 100)]);
    expect(pickVariant(0.9999, allocation)).toBe('a');
  });

  it('should pick the last variant when the value is at exactly 1.0', () => {
    const allocation = buildAllocation([v('a', 50), v('b', 50)]);
    // Last variant's upperBound is forced to 1, so 0.99999 lands inside b.
    expect(pickVariant(0.99999, allocation)).toBe('b');
  });
});
