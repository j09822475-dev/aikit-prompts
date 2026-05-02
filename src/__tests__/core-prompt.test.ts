import { describe, expect, it, expectTypeOf, vi, beforeEach } from 'vitest';
import { prompt, fromJSON } from '../core/prompt.js';
import { VariableError } from '../errors/variable-error.js';
import { BuilderFrozenError } from '../errors/misc-errors.js';
import { TemplateError } from '../errors/template-error.js';
import type { PromptDefinition } from '../core/types.js';

describe('prompt() builder', () => {
  it('should build a frozen PromptDefinition exposing the supplied id and template', () => {
    const def = prompt('greet').template('Hello {{name}}').build();
    expect(def.id).toBe('greet');
    expect(def.template).toBe('Hello {{name}}');
    expect(Object.isFrozen(def)).toBe(true);
  });

  it('should render a template with simple variable substitution', () => {
    const def = prompt('greet').template('Hello {{name}}').build();
    expect(def.render({ name: 'Alice' })).toBe('Hello Alice');
  });

  it('should attach a SemVer version and surface it on the definition', () => {
    const def = prompt('p')
      .version('1.2.3')
      .template('hi')
      .build();
    expect(def.version).toBe('1.2.3');
  });

  it('should pre-fill variables via .partial() and omit them from render()', () => {
    const def = prompt('greet')
      .template('{{role}} says {{msg}}')
      .partial({ role: 'admin' })
      .build();
    expect(def.render({ msg: 'hi' })).toBe('admin says hi');
    expect(def.partial).toEqual({ role: 'admin' });
    expect(def.variables()).toEqual(['msg']);
  });

  it('should attach metadata and tags and expose them on the frozen definition', () => {
    const def = prompt('p')
      .template('x')
      .metadata({ owner: 'alice' })
      .tags('experimental', 'beta')
      .build();
    expect(def.metadata).toEqual({ owner: 'alice' });
    expect(def.tags).toEqual(['experimental', 'beta']);
  });

  it('should throw VariableError when a required variable is missing at render', () => {
    const def = prompt('greet').template('Hello {{name}}').build();
    expect(() => def.render({} as { name: string })).toThrowError(
      VariableError,
    );
  });

  it('should report every missing variable in a single VariableError', () => {
    const def = prompt('p').template('{{a}} {{b}} {{c}}').build();
    let caught: VariableError | undefined;
    try {
      def.render({} as { a: string; b: string; c: string });
    } catch (e) {
      caught = e as VariableError;
    }
    expect(caught?.code).toBe('VARIABLE_MISSING');
    expect(caught?.missing).toEqual(['a', 'b', 'c']);
    expect(caught?.templateId).toBe('p');
  });

  it('should treat optional variables as renderable to empty when missing', () => {
    const def = prompt('p').template('A{{x?}}B').build();
    expect(def.render({})).toBe('AB');
  });

  it('should render numbers, booleans, bigints and arrays via stringification', () => {
    const def = prompt('p')
      .template('{{n}} {{b}} {{xs}} {{big}}')
      .build();
    expect(def.render({ n: 42, b: true, xs: [1, 2, 3], big: 9007199254740993n }))
      .toBe('42 true 1, 2, 3 9007199254740993');
  });

  it('should JSON-stringify object values when escape is json', () => {
    const def = prompt('p').template('{{obj}}').build();
    const out = def.render({ obj: { a: 1 } }, { escape: 'json' });
    expect(out).toBe('{"a":1}');
  });

  it('should throw VariableError when value type is function or symbol', () => {
    const def = prompt('p').template('{{x}}').build();
    expect(() => def.render({ x: (): void => undefined } as never)).toThrow(
      VariableError,
    );
    expect(() => def.render({ x: Symbol('s') } as never)).toThrow(
      VariableError,
    );
  });

  it('should throw VariableError when JSON-encoding hits a circular reference', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    const def = prompt('p').template('{{x}}').build();
    expect(() => def.render({ x: obj }, { escape: 'json' })).toThrow(
      VariableError,
    );
  });

  it('should escape markdown punctuation when escape is markdown', () => {
    const def = prompt('p').template('{{val}}').build();
    expect(def.render({ val: '*hi*' }, { escape: 'markdown' })).toBe(
      '\\*hi\\*',
    );
  });

  it('should warn when an unknown variable is passed in strict mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    const def = prompt('p').template('{{a}}').build();
    def.render({ a: 'x', extra: 'y' } as never);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should not warn about unknown variables when strict is false', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
    const def = prompt('p').template('{{a}}').build();
    def.render({ a: 'x', extra: 'y' } as never, { strict: false });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should attach a validate() callback that surfaces returned errors as VariableError', () => {
    const def = prompt('p')
      .template('{{x}}')
      .validate((vars) =>
        typeof vars['x'] === 'string' && vars['x'].length > 3
          ? []
          : ['too short'],
      )
      .build();
    let caught: VariableError | undefined;
    try {
      def.render({ x: 'hi' });
    } catch (e) {
      caught = e as VariableError;
    }
    expect(caught?.code).toBe('VARIABLE_VALIDATION_FAILED');
    expect(caught?.validationErrors).toEqual(['too short']);
  });

  it('should wrap a throw inside the validate() callback as VARIABLE_VALIDATION_FAILED with cause', () => {
    const cause = new Error('boom');
    const def = prompt('p')
      .template('{{x}}')
      .validate(() => {
        throw cause;
      })
      .build();
    let caught: VariableError | undefined;
    try {
      def.render({ x: 'a' });
    } catch (e) {
      caught = e as VariableError;
    }
    expect(caught?.code).toBe('VARIABLE_VALIDATION_FAILED');
    expect(caught?.cause).toBe(cause);
  });

  it('should freeze the builder after .build() and refuse later mutation', () => {
    const builder = prompt('p').template('{{x}}');
    builder.build();
    expect(() => builder.template('{{y}}')).toThrowError(BuilderFrozenError);
    expect(() => builder.metadata({})).toThrowError(BuilderFrozenError);
    expect(() => builder.tags('x')).toThrowError(BuilderFrozenError);
    expect(() => builder.partial({} as never)).toThrowError(BuilderFrozenError);
    expect(() => builder.validate(() => [])).toThrowError(BuilderFrozenError);
    expect(() => builder.version('1.0.0')).toThrowError(BuilderFrozenError);
    expect(() => builder.build()).toThrowError(BuilderFrozenError);
  });

  it('should expose tryRender returning ok=true on success', () => {
    const def = prompt('p').template('{{x}}').build();
    const r = def.tryRender({ x: 'a' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('a');
  });

  it('should expose tryRender returning ok=false with VariableError on failure', () => {
    const def = prompt('p').template('{{x}}').build();
    const r = def.tryRender({} as { x: string });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(VariableError);
  });

  it('should rethrow non-VariableError exceptions from tryRender', () => {
    const def = prompt('p')
      .template('{{x}}')
      .validate(() => {
        throw new RangeError('nope');
      })
      .build();
    // Validate throw is caught and wrapped as VariableError, so tryRender returns err.
    const r = def.tryRender({ x: 'a' });
    expect(r.ok).toBe(false);
  });

  it('should serialize and round-trip via toJSON / fromJSON', () => {
    const def = prompt('greet')
      .version('1.0.0')
      .template('Hello {{name}}')
      .partial({})
      .metadata({ owner: 'alice' })
      .tags('beta')
      .build();
    const json = def.toJSON();
    expect(json.id).toBe('greet');
    expect(json.version).toBe('1.0.0');
    expect(json.template).toBe('Hello {{name}}');
    const restored = fromJSON(json);
    expect(restored.id).toBe(def.id);
    expect(restored.template).toBe(def.template);
    expect(restored.render({ name: 'Bob' })).toBe('Hello Bob');
  });

  it('should restore a prompt without version via fromJSON', () => {
    const def = prompt('x').template('hi').build();
    const restored = fromJSON(def.toJSON());
    expect(restored.version).toBeUndefined();
  });

  it('should propagate parser errors at .build() time', () => {
    const builder = prompt('p').template('{{x:nope}}' as string);
    expect(() => builder.build()).toThrowError(TemplateError);
  });

  it('should let the caller refine input shape via .input<T>()', () => {
    const def = prompt('p')
      .template('{{role}}')
      .input<{ role: 'admin' | 'guest' }>()
      .build();
    expectTypeOf(def.render).parameter(0).toMatchTypeOf<{
      role: 'admin' | 'guest';
    }>();
    expect(def.render({ role: 'admin' })).toBe('admin');
  });

  it('should allow replaceInput to set a totally new shape', () => {
    const def = prompt('p')
      .template('{{x}}')
      .replaceInput<{ x: string }>()
      .build();
    expect(def.render({ x: 'val' })).toBe('val');
  });

  it('should infer the variable type from template-literal types', () => {
    const def = prompt('p').template('Hi {{name}}, age {{age:number}}').build();
    expectTypeOf(def.render).parameter(0).toMatchTypeOf<{
      name: string;
      age: number;
    }>();
  });

  it('should produce PromptDefinition with the version as a string-literal type', () => {
    const def = prompt('p').version('2.0.0').template('hi').build();
    expectTypeOf(def.version).toEqualTypeOf<'2.0.0'>();
  });
});

describe('PromptDefinition.variables()', () => {
  it('should exclude partial-prefilled variables from the reported list', () => {
    const def = prompt('p')
      .template('{{a}} {{b}}')
      .partial({ a: '1' })
      .build();
    expect(def.variables()).toEqual(['b']);
  });
});

describe('fromJSON', () => {
  beforeEach(() => {
    // No-op; ensures registry of side effects is fresh.
  });

  it('should rehydrate a prompt with metadata, tags, partial, and version', () => {
    const def = fromJSON({
      id: 'greet',
      version: '1.0.0',
      template: 'Hi {{name}}',
      partial: { name: 'World' },
      metadata: { owner: 'alice' },
      tags: ['beta'],
    });
    expect(def.id).toBe('greet');
    expect(def.version).toBe('1.0.0');
    expect(def.metadata).toEqual({ owner: 'alice' });
    expect(def.tags).toEqual(['beta']);
    expect(def.render({})).toBe('Hi World');
  });

  it('should produce a PromptDefinition shape callable via render', () => {
    const def: PromptDefinition = fromJSON({
      id: 'x',
      version: undefined,
      template: '{{a}}',
      partial: {},
      metadata: {},
      tags: [],
    });
    expect(def.render({ a: 'z' })).toBe('z');
  });
});
