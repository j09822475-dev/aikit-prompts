import { describe, expect, it } from 'vitest';
import { createABTest } from '../testing/ab-test.js';
import { ABTestError } from '../errors/ab-test-error.js';
import { prompt } from '../core/prompt.js';

const variant = (id: string, weight: number) => ({
  id,
  prompt: prompt(id).template('Hi {{name}}').build(),
  weight,
});

describe('createABTest — assignment', () => {
  const test = createABTest({
    name: 'experiment-1',
    variants: [variant('control', 50), variant('treatment', 50)],
    identifier: (ctx) => ctx['userId'] as string | undefined,
  });

  it('should always return the same variant for the same identifier', () => {
    const a = test.assign({ userId: 'user-1' });
    const b = test.assign({ userId: 'user-1' });
    expect(a).toEqual(b);
  });

  it('should return kind=variant when identifier is present', () => {
    const a = test.assign({ userId: 'user-1' });
    expect(a.kind).toBe('variant');
  });

  it('should return kind=unassigned with reason no-identifier when identifier missing', () => {
    const a = test.assign({});
    expect(a.kind).toBe('unassigned');
    if (a.kind === 'unassigned') expect(a.reason).toBe('no-identifier');
  });

  it('should return kind=unassigned with reason identifier-threw when identifier throws', () => {
    const t = createABTest({
      name: 'thrown',
      variants: [variant('a', 100)],
      identifier: () => {
        throw new Error('boom');
      },
    });
    const a = t.assign({});
    expect(a.kind).toBe('unassigned');
    if (a.kind === 'unassigned') {
      expect(a.reason).toBe('identifier-threw');
      expect(a.cause).toBeInstanceOf(Error);
    }
  });

  it('should return kind=variant with prompt set when assigned', () => {
    const a = test.assign({ userId: 'user-x' });
    if (a.kind === 'variant') {
      expect(a.prompt).toBeDefined();
      expect(typeof a.prompt.render).toBe('function');
      expect(['control', 'treatment']).toContain(a.id);
    }
  });

  it('should return kind=unassigned for empty-string identifier', () => {
    const a = test.assign({ userId: '' });
    expect(a.kind).toBe('unassigned');
  });
});

describe('createABTest — bucket()', () => {
  const test = createABTest({
    name: 'bucket-test',
    variants: [variant('a', 100)],
    identifier: (ctx) => ctx['userId'] as string | undefined,
  });

  it('should return a deterministic bucket value for the same identifier', () => {
    expect(test.bucket({ userId: 'user-1' })).toBe(
      test.bucket({ userId: 'user-1' }),
    );
  });

  it('should return a value in [0, 1) for any identifier', () => {
    const v = test.bucket({ userId: 'user-2' });
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('should return -1 when identifier is missing', () => {
    expect(test.bucket({})).toBe(-1);
  });

  it('should return -1 when identifier throws', () => {
    const t = createABTest({
      name: 'thrown-2',
      variants: [variant('a', 100)],
      identifier: () => {
        throw new Error('boom');
      },
    });
    expect(t.bucket({})).toBe(-1);
  });
});

describe('createABTest — holdout', () => {
  it('should return kind=holdout when bucket lands below the holdout fraction', () => {
    const test = createABTest({
      name: 'holdout-test',
      variants: [variant('a', 100)],
      identifier: (ctx) => ctx['id'] as string | undefined,
      holdout: 1.0,
    });
    const a = test.assign({ id: 'x' });
    expect(a.kind).toBe('holdout');
  });

  it('should never return holdout when holdout is zero', () => {
    const test = createABTest({
      name: 'no-holdout',
      variants: [variant('a', 100)],
      identifier: (ctx) => ctx['id'] as string | undefined,
    });
    const a = test.assign({ id: 'x' });
    expect(a.kind).not.toBe('holdout');
  });
});

describe('createABTest — invariants', () => {
  it('should throw ABTestError on duplicate variant ids at construction', () => {
    expect(() =>
      createABTest({
        name: 'bad',
        variants: [variant('a', 50), variant('a', 50)],
        identifier: () => 'x',
      }),
    ).toThrow(ABTestError);
  });

  it('should throw ABTestError when weights sum to more than 100', () => {
    expect(() =>
      createABTest({
        name: 'bad-weights',
        variants: [variant('a', 60), variant('b', 60)],
        identifier: () => 'x',
      }),
    ).toThrow(ABTestError);
  });

  it('should expose a stable name on the test instance', () => {
    const test = createABTest({
      name: 'experiment-1',
      variants: [variant('a', 100)],
      identifier: () => 'x',
    });
    expect(test.name).toBe('experiment-1');
  });

  it('should accept a custom hash function', () => {
    const calls: string[] = [];
    const customHash = (s: string): number => {
      calls.push(s);
      return 0;
    };
    const test = createABTest({
      name: 'custom-hash',
      variants: [variant('a', 100)],
      identifier: (ctx) => ctx['id'] as string | undefined,
      hash: customHash,
    });
    test.assign({ id: 'foo' });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toContain('foo');
  });
});

describe('createABTest — distribution sanity', () => {
  it('should produce roughly even traffic across two equal-weight variants', () => {
    const test = createABTest({
      name: 'distribution',
      variants: [variant('a', 50), variant('b', 50)],
      identifier: (ctx) => ctx['id'] as string | undefined,
    });
    let aCount = 0;
    let bCount = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const a = test.assign({ id: `user-${i}` });
      if (a.kind === 'variant') {
        if (a.id === 'a') aCount++;
        else if (a.id === 'b') bCount++;
      }
    }
    // Should be within ~5% of even split.
    expect(aCount + bCount).toBe(N);
    expect(Math.abs(aCount - bCount)).toBeLessThan(N * 0.1);
  });
});
