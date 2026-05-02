import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  compileTemplate,
  extract,
  registerDirectiveRenderer,
} from '../core/template.js';
import { TemplateError } from '../errors/template-error.js';

describe('compileTemplate', () => {
  it('should produce an AST with the source preserved', () => {
    const ast = compileTemplate('Hi {{name}}');
    expect(ast.source).toBe('Hi {{name}}');
    expect(ast.variables).toEqual(['name']);
  });

  it('should throw TemplateError on a malformed template body', () => {
    expect(() => compileTemplate('{{name')).toThrowError(TemplateError);
  });
});

describe('extract', () => {
  it('should return an empty array when no variables are referenced', () => {
    expect(extract('hello world')).toEqual([]);
  });

  it('should return variable names in declaration order', () => {
    expect(extract('{{a}} {{b}} {{c}}')).toEqual(['a', 'b', 'c']);
  });

  it('should deduplicate variables seen multiple times', () => {
    expect(extract('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('should propagate parser errors as TemplateError', () => {
    expect(() => extract('{{x:nope}}')).toThrowError(TemplateError);
  });
});

describe('registerDirectiveRenderer', () => {
  const consoleWarn = vi
    .spyOn(console, 'warn')
    .mockImplementation((): void => undefined);

  afterEach(() => {
    consoleWarn.mockClear();
  });

  it('should register a renderer that the AST walker invokes for matching node types', async () => {
    const { registerBlockDirective } = await import(
      '../internal/parser.js'
    );
    registerBlockDirective(
      'shout',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state, _args, parseChildren): any => ({
        type: 'shout',
        children: parseChildren(state, 'shout'),
      }),
    );
    registerDirectiveRenderer(
      'shout',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node: any, ctx, renderNodes): string =>
        renderNodes(node.children, ctx).toUpperCase(),
    );
    const { prompt } = await import('../core/prompt.js');
    const p = prompt('p').template('{{#shout}}hi {{name}}{{/shout}}').build();
    expect(p.render({ name: 'Alice' })).toBe('HI ALICE');
  });
});
