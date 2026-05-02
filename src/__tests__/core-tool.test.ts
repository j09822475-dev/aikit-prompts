import { describe, expect, it, expectTypeOf } from 'vitest';
import { tool } from '../core/tool.js';
import { ToolSchemaError } from '../errors/misc-errors.js';

describe('tool()', () => {
  it('should produce a frozen Tool object with the supplied fields', () => {
    const t = tool({
      name: 'web_search',
      description: 'Search the web.',
      parameters: { type: 'object', properties: {} },
    });
    expect(t.name).toBe('web_search');
    expect(t.description).toBe('Search the web.');
    expect(t.parameters).toEqual({ type: 'object', properties: {} });
    expect(Object.isFrozen(t)).toBe(true);
  });

  it('should infer the literal name and parameter type at the type level', () => {
    const t = tool<'web_search', { query: string }>({
      name: 'web_search',
      description: 'd',
      parameters: { type: 'object' },
    });
    expectTypeOf(t.name).toEqualTypeOf<'web_search'>();
  });

  it('should throw ToolSchemaError when name is missing or empty', () => {
    expect(() =>
      tool({
        name: '',
        description: 'd',
        parameters: { type: 'object' },
      }),
    ).toThrowError(ToolSchemaError);
  });

  it('should throw ToolSchemaError when description is not a string', () => {
    expect(() =>
      tool({
        name: 'x',
        description: 5 as unknown as string,
        parameters: { type: 'object' },
      }),
    ).toThrowError(ToolSchemaError);
  });

  it('should throw ToolSchemaError when parameters is null or non-object', () => {
    expect(() =>
      tool({
        name: 'x',
        description: 'd',
        parameters: null as unknown as Record<string, unknown>,
      }),
    ).toThrowError(ToolSchemaError);
  });

  it('should throw ToolSchemaError when parameters has a non-object root type', () => {
    expect(() =>
      tool({
        name: 'x',
        description: 'd',
        parameters: { type: 'string' },
      }),
    ).toThrowError(ToolSchemaError);
  });

  it('should throw ToolSchemaError when the type field is missing entirely', () => {
    expect(() =>
      tool({
        name: 'x',
        description: 'd',
        parameters: {},
      }),
    ).toThrowError(ToolSchemaError);
  });
});
