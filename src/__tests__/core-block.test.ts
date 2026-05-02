import { describe, expect, it } from 'vitest';
import { block } from '../core/block.js';
import { BuilderFrozenError } from '../errors/misc-errors.js';
import { TemplateError } from '../errors/template-error.js';

describe('block() builder', () => {
  it('should produce a frozen block with the supplied role', () => {
    const b = block('system').template('You are {{x}}').build();
    expect(b.role).toBe('system');
    expect(Object.isFrozen(b)).toBe(true);
  });

  it('should accept few-shot examples and store them in declaration order', () => {
    const b = block('user')
      .examples([
        { user: 'hi', assistant: 'hello' },
        { user: 'bye', assistant: 'goodbye' },
      ])
      .build();
    expect(b.examples).toEqual([
      { user: 'hi', assistant: 'hello' },
      { user: 'bye', assistant: 'goodbye' },
    ]);
  });

  it('should accept partial values for variables', () => {
    const b = block('system')
      .template('{{a}} {{b}}')
      .partial({ a: 'X' })
      .build();
    expect(b.partial).toEqual({ a: 'X' });
  });

  it('should set cacheBreakpoint to true when .cacheBreakpoint() was called', () => {
    const b = block('system').template('hi').cacheBreakpoint().build();
    expect(b.cacheBreakpoint).toBe(true);
  });

  it('should default cacheBreakpoint to false otherwise', () => {
    const b = block('system').template('hi').build();
    expect(b.cacheBreakpoint).toBe(false);
  });

  it('should leave the AST undefined when no template was supplied', () => {
    const b = block('system').cacheBreakpoint().build();
    expect(b.template).toBeUndefined();
    expect(b._ast).toBeUndefined();
  });

  it('should throw BuilderFrozenError when calling builder methods after build', () => {
    const builder = block('system').template('hi');
    builder.build();
    expect(() => builder.template('y')).toThrowError(BuilderFrozenError);
    expect(() => builder.examples([])).toThrowError(BuilderFrozenError);
    expect(() => builder.partial({} as never)).toThrowError(BuilderFrozenError);
    expect(() => builder.cacheBreakpoint()).toThrowError(BuilderFrozenError);
    expect(() => builder.build()).toThrowError(BuilderFrozenError);
  });

  it('should propagate TemplateError when template body is malformed', () => {
    expect(() => block('system').template('{{x:nope}}').build()).toThrowError(
      TemplateError,
    );
  });

  it('should freeze the examples array', () => {
    const b = block('user')
      .examples([{ user: 'a', assistant: 'b' }])
      .build();
    expect(Object.isFrozen(b.examples)).toBe(true);
  });
});
