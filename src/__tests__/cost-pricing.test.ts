import { describe, expect, it, afterEach } from 'vitest';
import {
  registerModel,
  unregisterModel,
  listModels,
  getPricing,
} from '../cost/pricing-registry.js';
import { BUILTIN_PRICING, PRICING_DATE } from '../cost/pricing.js';
import { CostError } from '../errors/cost-error.js';

describe('built-in pricing snapshot', () => {
  it('should expose a frozen PRICING_DATE constant', () => {
    expect(typeof PRICING_DATE).toBe('string');
    expect(PRICING_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should include the major OpenAI and Anthropic models', () => {
    expect(BUILTIN_PRICING['gpt-4o']).toBeDefined();
    expect(BUILTIN_PRICING['gpt-4o-mini']).toBeDefined();
    expect(BUILTIN_PRICING['claude-3-5-sonnet-latest']).toBeDefined();
    expect(BUILTIN_PRICING['gemini-1.5-pro']).toBeDefined();
  });

  it('should expose every entry as frozen', () => {
    expect(Object.isFrozen(BUILTIN_PRICING)).toBe(true);
    expect(Object.isFrozen(BUILTIN_PRICING['gpt-4o'])).toBe(true);
  });
});

describe('getPricing', () => {
  it('should return the built-in entry for a known model', () => {
    const p = getPricing('gpt-4o');
    expect(p.inputUSDPer1M).toBe(2.5);
    expect(p.outputUSDPer1M).toBe(10);
  });

  it('should throw COST_UNKNOWN_MODEL for an unregistered model', () => {
    let caught: CostError | undefined;
    try {
      getPricing('mystery-model-xyz');
    } catch (e) {
      caught = e as CostError;
    }
    expect(caught?.code).toBe('COST_UNKNOWN_MODEL');
    expect(caught?.model).toBe('mystery-model-xyz');
  });
});

describe('registerModel / unregisterModel', () => {
  afterEach(() => {
    unregisterModel('test-custom');
    unregisterModel('test-shadow');
  });

  it('should register a custom model that getPricing returns', () => {
    registerModel('test-custom', { inputUSDPer1M: 1, outputUSDPer1M: 2 });
    expect(getPricing('test-custom').inputUSDPer1M).toBe(1);
  });

  it('should let custom pricing shadow a built-in entry', () => {
    registerModel('test-shadow', { inputUSDPer1M: 99, outputUSDPer1M: 100 });
    registerModel('gpt-4o', {
      inputUSDPer1M: 0.001,
      outputUSDPer1M: 0.002,
    });
    expect(getPricing('gpt-4o').inputUSDPer1M).toBe(0.001);
    unregisterModel('gpt-4o');
    expect(getPricing('gpt-4o').inputUSDPer1M).toBe(2.5);
  });

  it('should report unregister success and false for missing entries', () => {
    registerModel('test-custom', { inputUSDPer1M: 1, outputUSDPer1M: 2 });
    expect(unregisterModel('test-custom')).toBe(true);
    expect(unregisterModel('test-custom')).toBe(false);
  });

  it('should throw on negative or non-finite price values', () => {
    expect(() =>
      registerModel('bad', { inputUSDPer1M: -1, outputUSDPer1M: 2 }),
    ).toThrow(CostError);
    expect(() =>
      registerModel('bad', { inputUSDPer1M: NaN, outputUSDPer1M: 2 }),
    ).toThrow(CostError);
  });

  it('should validate optional fields cachedInputUSDPer1M and imageBaseTokens', () => {
    expect(() =>
      registerModel('bad', {
        inputUSDPer1M: 1,
        outputUSDPer1M: 2,
        cachedInputUSDPer1M: -1,
      }),
    ).toThrow(CostError);
    expect(() =>
      registerModel('bad', {
        inputUSDPer1M: 1,
        outputUSDPer1M: 2,
        imageBaseTokens: NaN,
      }),
    ).toThrow(CostError);
  });

  it('should expose listModels with both built-in and registered entries', () => {
    registerModel('test-custom', { inputUSDPer1M: 1, outputUSDPer1M: 2 });
    const models = listModels();
    expect(models).toContain('gpt-4o');
    expect(models).toContain('test-custom');
  });
});
