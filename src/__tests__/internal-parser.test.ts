import { describe, expect, it } from 'vitest';
import {
  parseTemplate,
  registerBlockDirective,
  registerInlineDirective,
} from '../internal/parser.js';
import { TemplateError } from '../errors/template-error.js';

describe('parseTemplate — basic tokens', () => {
  it('should produce a single text node when source has no variables', () => {
    const ast = parseTemplate('plain text');
    expect(ast.nodes).toHaveLength(1);
    expect(ast.nodes[0]).toEqual({ type: 'text', value: 'plain text' });
    expect(ast.variables).toEqual([]);
  });

  it('should parse a simple variable substitution as a var node', () => {
    const ast = parseTemplate('Hi {{name}}');
    expect(ast.nodes).toHaveLength(2);
    expect(ast.nodes[0]).toEqual({ type: 'text', value: 'Hi ' });
    expect(ast.nodes[1]).toMatchObject({
      type: 'var',
      name: 'name',
      optional: false,
      typeToken: 'string',
    });
    expect(ast.variables).toEqual(['name']);
  });

  it('should mark a variable as optional when written with the trailing question mark', () => {
    const ast = parseTemplate('{{maybe?}}');
    expect(ast.nodes[0]).toMatchObject({ optional: true, name: 'maybe' });
    expect(ast.optionalVariables).toContain('maybe');
  });

  it('should parse a typed variable with the declared type token preserved', () => {
    const ast = parseTemplate('{{age:number}}');
    expect(ast.nodes[0]).toMatchObject({
      type: 'var',
      name: 'age',
      typeToken: 'number',
    });
  });

  it('should accept the array type tokens recognized by the parser', () => {
    for (const t of ['string[]', 'number[]', 'boolean[]'] as const) {
      const ast = parseTemplate(`{{xs:${t}}}`);
      expect(ast.nodes[0]).toMatchObject({ typeToken: t });
    }
  });

  it('should throw TemplateError when a typed variable uses an unknown token', () => {
    expect(() => parseTemplate('{{x:date}}')).toThrowError(TemplateError);
  });

  it('should throw TemplateError when a variable name is empty', () => {
    expect(() => parseTemplate('{{ }}')).toThrowError(TemplateError);
  });

  it('should not duplicate variable entries when the same name appears twice', () => {
    const ast = parseTemplate('{{x}} {{x}}');
    expect(ast.variables).toEqual(['x']);
  });

  it('should treat a variable as required once required ever wins over optional', () => {
    const ast = parseTemplate('{{x?}} {{x}}');
    expect(ast.optionalVariables).not.toContain('x');
  });

  it('should keep optional flag when only optional uses appear', () => {
    const ast = parseTemplate('{{x?}} {{x?}}');
    expect(ast.optionalVariables).toContain('x');
  });

  it('should parse comments and strip them from the rendered output', () => {
    const ast = parseTemplate('a{{!-- hidden --}}b');
    const types = ast.nodes.map((n) => n.type);
    expect(types).toEqual(['text', 'comment', 'text']);
  });

  it('should unescape backslash-escaped braces back to literal braces', () => {
    const ast = parseTemplate('not a var: \\{\\{name\\}\\}');
    expect(ast.nodes).toHaveLength(1);
    const text = ast.nodes[0];
    expect(text).toMatchObject({ type: 'text' });
    expect((text as { value: string }).value).toContain('{{name}}');
    expect(ast.variables).toEqual([]);
  });
});

describe('parseTemplate — error handling', () => {
  it('should throw TEMPLATE_UNCLOSED_TAG when an opening tag has no closer', () => {
    let caught: TemplateError | undefined;
    try {
      parseTemplate('hello {{name');
    } catch (e) {
      caught = e as TemplateError;
    }
    expect(caught).toBeInstanceOf(TemplateError);
    expect(caught?.code).toBe('TEMPLATE_UNCLOSED_TAG');
  });

  it('should throw TEMPLATE_PARSE on a stray closing tag without a matching block', () => {
    expect(() => parseTemplate('{{/foo}}')).toThrowError(TemplateError);
  });

  it('should throw TEMPLATE_UNKNOWN_DIRECTIVE for an unregistered block directive', () => {
    let caught: TemplateError | undefined;
    try {
      parseTemplate('{{#unknown}}body{{/unknown}}');
    } catch (e) {
      caught = e as TemplateError;
    }
    expect(caught).toBeInstanceOf(TemplateError);
    expect(caught?.code).toBe('TEMPLATE_UNKNOWN_DIRECTIVE');
  });

  it('should provide a snippet around the failure position when throwing', () => {
    let caught: TemplateError | undefined;
    try {
      parseTemplate('aaaa {{x:nope}} bbbb');
    } catch (e) {
      caught = e as TemplateError;
    }
    expect(caught).toBeInstanceOf(TemplateError);
    expect(typeof caught?.position).toBe('number');
    expect(typeof caught?.snippet).toBe('string');
  });
});

describe('parseTemplate — directive extension API', () => {
  it('should accept a custom block directive registered via registerBlockDirective', () => {
    registerBlockDirective('echo', (_state, _args, parseChildren) => {
      const children = parseChildren(_state, 'echo');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { type: 'echo', children: Object.freeze(children) } as any;
    });
    const ast = parseTemplate('A {{#echo}}body{{/echo}} Z');
    const echoNode = ast.nodes.find((n) => n.type === 'echo');
    expect(echoNode).toBeDefined();
  });

  it('should accept a custom inline directive registered via registerInlineDirective', () => {
    registerInlineDirective('@', (_state, args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { type: 'inline-at', value: args } as any;
    });
    const ast = parseTemplate('hi {{@foo}}');
    const inline = ast.nodes.find((n) => n.type === 'inline-at');
    expect(inline).toBeDefined();
    expect((inline as { value: string }).value).toBe('foo');
  });
});
