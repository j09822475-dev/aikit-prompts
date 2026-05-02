import { describe, expect, it, beforeAll } from 'vitest';
import {
  withIfEach,
  withPartials,
  registerPartial,
  unregisterPartial,
} from '../template-extras/index.js';
import { prompt } from '../core/prompt.js';
import { TemplateError } from '../errors/template-error.js';

beforeAll(() => {
  withIfEach();
  withPartials();
});

describe('withIfEach + #if directive', () => {
  it('should render the body when the variable is truthy', () => {
    const p = prompt('p').template('{{#if x}}YES{{/if}}').build();
    expect(p.render({ x: 'a' } as never)).toBe('YES');
  });

  it('should render an empty string when the variable is falsy and no else branch is present', () => {
    const p = prompt('p').template('{{#if x}}YES{{/if}}').build();
    expect(p.render({ x: '' } as never)).toBe('');
    expect(p.render({ x: 0 } as never)).toBe('');
    expect(p.render({ x: false } as never)).toBe('');
    expect(p.render({ x: null } as never)).toBe('');
    expect(p.render({} as never)).toBe('');
  });

  it('should render an empty array as falsy', () => {
    const p = prompt('p').template('{{#if xs}}has{{/if}}').build();
    expect(p.render({ xs: [] } as never)).toBe('');
    expect(p.render({ xs: ['a'] } as never)).toBe('has');
  });

  it('should support an else branch when the literal " ELSE " marker isolates a text node', () => {
    // The parser splits text on adjacent tokens — comments separate the
    // marker into its own text node so the if-renderer can find it.
    const p = prompt('p')
      .template('{{#if x}}A{{!--mark--}} ELSE {{!--mark--}}B{{/if}}')
      .build();
    expect(p.render({ x: true } as never)).toBe('A');
    expect(p.render({ x: false } as never)).toBe('B');
  });

  it('should throw TemplateError when #if is given no variable name', () => {
    expect(() => prompt('p').template('{{#if}}body{{/if}}').build()).toThrow(
      TemplateError,
    );
  });

  it('should throw TemplateError when #else is used as a standalone directive', () => {
    expect(() =>
      prompt('p').template('{{#else}}body{{/else}}').build(),
    ).toThrow(TemplateError);
  });
});

describe('withIfEach + #each directive', () => {
  it('should iterate over array values exposing this and @index inside the body', () => {
    const p = prompt('p').template('{{#each xs}}[{{@index}}={{this}}]{{/each}}').build();
    expect(p.render({ xs: ['a', 'b', 'c'] } as never)).toBe(
      '[0=a][1=b][2=c]',
    );
  });

  it('should render an empty string when the iterable is missing or non-array', () => {
    const p = prompt('p').template('{{#each xs}}x{{/each}}').build();
    expect(p.render({ xs: 'not-an-array' } as never)).toBe('');
    expect(p.render({} as never)).toBe('');
  });

  it('should render nothing for an empty array', () => {
    const p = prompt('p').template('{{#each xs}}x{{/each}}').build();
    expect(p.render({ xs: [] } as never)).toBe('');
  });

  it('should throw TemplateError when #each is given no variable name', () => {
    expect(() =>
      prompt('p').template('{{#each}}body{{/each}}').build(),
    ).toThrow(TemplateError);
  });
});

describe('withPartials + > directive', () => {
  it('should inline a registered partial via the {{> name}} syntax', () => {
    registerPartial('greet', 'Hello world');
    const p = prompt('p').template('Say: {{> greet}}').build();
    expect(p.render({})).toBe('Say: Hello world');
  });

  it('should render a placeholder string when the partial name is unknown', () => {
    const p = prompt('p').template('{{> missing}}').build();
    expect(p.render({})).toContain("[unknown partial 'missing']");
  });

  it('should remove a partial via unregisterPartial and report removal status', () => {
    registerPartial('temp', 'X');
    const removed = unregisterPartial('temp');
    expect(removed).toBe(true);
    expect(unregisterPartial('temp')).toBe(false);
  });

  it('should throw TemplateError when the > directive has no name', () => {
    expect(() => prompt('p').template('{{> }}').build()).toThrow(
      TemplateError,
    );
  });
});

describe('Idempotency of activation helpers', () => {
  it('should be safe to call withIfEach multiple times without error', () => {
    expect(() => {
      withIfEach();
      withIfEach();
    }).not.toThrow();
  });

  it('should be safe to call withPartials multiple times without error', () => {
    expect(() => {
      withPartials();
      withPartials();
    }).not.toThrow();
  });
});
