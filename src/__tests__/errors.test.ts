import { describe, expect, it, expectTypeOf } from 'vitest';
import {
  PromptError,
  TemplateError,
  VariableError,
  VersionError,
  ABTestError,
  CostError,
  SourceError,
  RegistryDuplicateError,
  BuilderFrozenError,
  ToolSchemaError,
  CacheBreakpointLimitError,
  InvariantError,
  type ErrorCode,
} from '../errors/index.js';

describe('PromptError hierarchy', () => {
  it('should make every concrete subclass an instance of PromptError', () => {
    const t = new TemplateError('TEMPLATE_PARSE', 'm');
    expect(t).toBeInstanceOf(PromptError);
    expect(t).toBeInstanceOf(Error);
    expect(t).toBeInstanceOf(TemplateError);
  });

  it('should expose a literal ErrorCode union covering every code', () => {
    expectTypeOf<ErrorCode>().toMatchTypeOf<string>();
  });
});

describe('TemplateError', () => {
  it('should populate code, position and snippet from the details object', () => {
    const err = new TemplateError('TEMPLATE_UNCLOSED_TAG', 'unclosed', {
      position: 5,
      snippet: 'abc {{xyz',
    });
    expect(err.code).toBe('TEMPLATE_UNCLOSED_TAG');
    expect(err.position).toBe(5);
    expect(err.snippet).toBe('abc {{xyz');
    expect(err.message).toContain('unclosed');
  });

  it('should leave position and snippet undefined when not provided', () => {
    const err = new TemplateError('TEMPLATE_PARSE', 'm');
    expect(err.position).toBeUndefined();
    expect(err.snippet).toBeUndefined();
  });
});

describe('VariableError', () => {
  it('should default missing to an empty array when not supplied', () => {
    const err = new VariableError('VARIABLE_TYPE_MISMATCH', 'm');
    expect(err.missing).toEqual([]);
    expect(err.invalid).toBeUndefined();
    expect(err.validationErrors).toBeUndefined();
    expect(err.templateId).toBeUndefined();
  });

  it('should expose every detail field when supplied', () => {
    const cause = new Error('inner');
    const err = new VariableError('VARIABLE_VALIDATION_FAILED', 'bad', {
      missing: ['a'],
      invalid: 'b',
      validationErrors: ['too short'],
      templateId: 'p1',
      cause,
    });
    expect(err.missing).toEqual(['a']);
    expect(err.invalid).toBe('b');
    expect(err.validationErrors).toEqual(['too short']);
    expect(err.templateId).toBe('p1');
    expect(err.cause).toBe(cause);
  });

  it('should construct a VARIABLE_MISSING error via the static helper', () => {
    const err = VariableError.missing(['x', 'y'], 'tpl');
    expect(err.code).toBe('VARIABLE_MISSING');
    expect(err.missing).toEqual(['x', 'y']);
    expect(err.templateId).toBe('tpl');
    expect(err.message).toContain('x, y');
  });

  it('should omit templateId from the static helper when none was passed', () => {
    const err = VariableError.missing(['x']);
    expect(err.templateId).toBeUndefined();
  });
});

describe('VersionError', () => {
  it('should populate code, id and selector when provided', () => {
    const err = new VersionError('VERSION_NOT_FOUND', 'no version', {
      id: 'p',
      selector: '^1.0.0',
    });
    expect(err.code).toBe('VERSION_NOT_FOUND');
    expect(err.id).toBe('p');
    expect(err.selector).toBe('^1.0.0');
  });
});

describe('ABTestError', () => {
  it('should expose duplicateId and weightSum when set', () => {
    const dup = new ABTestError('AB_TEST_DUPLICATE_VARIANT', 'm', {
      duplicateId: 'a',
    });
    expect(dup.duplicateId).toBe('a');
    const w = new ABTestError('AB_TEST_INVALID_WEIGHTS', 'm', {
      weightSum: 110,
    });
    expect(w.weightSum).toBe(110);
  });
});

describe('CostError', () => {
  it('should propagate model and forward cause to Error', () => {
    const inner = new Error('boom');
    const err = new CostError('COST_INVALID_TOKEN_COUNT', 'm', {
      model: 'gpt-4o',
      cause: inner,
    });
    expect(err.model).toBe('gpt-4o');
    expect(err.cause).toBe(inner);
  });

  it('should leave model undefined when not supplied', () => {
    const err = new CostError('COST_UNKNOWN_MODEL', 'm');
    expect(err.model).toBeUndefined();
  });
});

describe('SourceError', () => {
  it('should expose sourceName, url and cause', () => {
    const inner = new Error('net');
    const err = new SourceError('SOURCE_LOAD_FAILED', 'm', {
      sourceName: 'http:x',
      url: 'https://x',
      cause: inner,
    });
    expect(err.sourceName).toBe('http:x');
    expect(err.url).toBe('https://x');
    expect(err.cause).toBe(inner);
  });
});

describe('RegistryDuplicateError', () => {
  it('should hold id and version and message references both', () => {
    const err = new RegistryDuplicateError('p', '1.0.0');
    expect(err.id).toBe('p');
    expect(err.version).toBe('1.0.0');
    expect(err.code).toBe('REGISTRY_DUPLICATE');
    expect(err.message).toContain('p');
    expect(err.message).toContain('1.0.0');
  });
});

describe('BuilderFrozenError', () => {
  it('should reference the offending method name in the message', () => {
    const err = new BuilderFrozenError('template');
    expect(err.message).toContain('template');
    expect(err.code).toBe('BUILDER_FROZEN');
  });
});

describe('ToolSchemaError', () => {
  it('should set toolName when provided', () => {
    const err = new ToolSchemaError('schema bad', 'mytool');
    expect(err.toolName).toBe('mytool');
  });

  it('should leave toolName undefined when omitted', () => {
    const err = new ToolSchemaError('schema bad');
    expect(err.toolName).toBeUndefined();
  });
});

describe('CacheBreakpointLimitError', () => {
  it('should expose the breakpoint count and reference Anthropic limit in message', () => {
    const err = new CacheBreakpointLimitError(5);
    expect(err.breakpointCount).toBe(5);
    expect(err.message).toContain('5');
    expect(err.message).toContain('4');
  });
});

describe('InvariantError', () => {
  it('should prefix the message with "Invariant violated"', () => {
    const err = new InvariantError('something failed');
    expect(err.message).toContain('Invariant violated');
    expect(err.message).toContain('something failed');
    expect(err.code).toBe('INVARIANT');
  });
});

describe('Error inheritance and prototype chain', () => {
  it('should preserve the prototype chain across all subclasses', () => {
    const all: Error[] = [
      new TemplateError('TEMPLATE_PARSE', 'a'),
      new VariableError('VARIABLE_MISSING', 'a'),
      new VersionError('VERSION_INVALID', 'a'),
      new ABTestError('AB_TEST_INVALID_WEIGHTS', 'a'),
      new CostError('COST_UNKNOWN_MODEL', 'a'),
      new SourceError('SOURCE_LOAD_FAILED', 'a'),
      new RegistryDuplicateError('id', '1.0.0'),
      new BuilderFrozenError('m'),
      new ToolSchemaError('s'),
      new CacheBreakpointLimitError(5),
      new InvariantError('x'),
    ];
    for (const e of all) {
      expect(e).toBeInstanceOf(PromptError);
      expect(e).toBeInstanceOf(Error);
    }
  });
});
