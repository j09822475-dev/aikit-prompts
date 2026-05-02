import { describe, expect, it, vi } from 'vitest';
import {
  createRegistry,
  createTypedRegistry,
} from '../versioning/registry.js';
import { prompt } from '../core/prompt.js';
import { memorySource } from '../sources/memory.js';
import {
  RegistryDuplicateError,
} from '../errors/misc-errors.js';
import { VersionError } from '../errors/version-error.js';
import type { PromptSource, SourceChangeEvent } from '../sources/types.js';

const def = (id: string, version: string, body = 'hi') =>
  prompt(id).version(version).template(body).build();

describe('createRegistry — basic mutations', () => {
  it('should register and look up a prompt by id', () => {
    const reg = createRegistry({ prompts: [def('greet', '1.0.0')] });
    const v = reg.get('greet');
    expect(v.id).toBe('greet');
    expect(v.version).toBe('1.0.0');
  });

  it('should pick the highest stable version when no selector is supplied', () => {
    const reg = createRegistry({
      prompts: [def('p', '1.0.0'), def('p', '1.2.0'), def('p', '2.0.0')],
    });
    expect(reg.get('p').version).toBe('2.0.0');
  });

  it('should resolve a SemVer range selector', () => {
    const reg = createRegistry({
      prompts: [def('p', '1.0.0'), def('p', '1.5.0'), def('p', '2.0.0')],
    });
    expect(reg.get('p', '^1.0.0').version).toBe('1.5.0');
  });

  it('should throw VersionError when no prompts are registered for the id', () => {
    const reg = createRegistry();
    expect(() => reg.get('missing')).toThrowError(VersionError);
  });

  it('should throw RegistryDuplicateError on a re-register without replace=true', () => {
    const reg = createRegistry({ prompts: [def('p', '1.0.0')] });
    expect(() => reg.register(def('p', '1.0.0'))).toThrow(
      RegistryDuplicateError,
    );
  });

  it('should overwrite an existing entry when replace is true', () => {
    const reg = createRegistry({ prompts: [def('p', '1.0.0', 'a')] });
    reg.register(def('p', '1.0.0', 'b'), { replace: true });
    expect(reg.get('p').template).toBe('b');
  });

  it('should throw VersionError when registering a definition without a version', () => {
    const reg = createRegistry();
    const noVersion = prompt('p').template('x').build();
    expect(() => reg.register(noVersion)).toThrowError(VersionError);
  });

  it('should remove an entry via unregister and report success', () => {
    const reg = createRegistry({ prompts: [def('p', '1.0.0')] });
    expect(reg.unregister('p', '1.0.0')).toBe(true);
    expect(reg.unregister('p', '1.0.0')).toBe(false);
  });

  it('should remove the bucket entirely when its last version is unregistered', () => {
    const reg = createRegistry({ prompts: [def('p', '1.0.0')] });
    reg.unregister('p', '1.0.0');
    expect(reg.ids()).not.toContain('p');
  });

  it('should expose .find returning undefined when not found', () => {
    const reg = createRegistry();
    expect(reg.find('missing')).toBeUndefined();
  });

  it('should expose .find returning the definition when found', () => {
    const reg = createRegistry({ prompts: [def('p', '1.0.0')] });
    const v = reg.find('p');
    expect(v?.id).toBe('p');
  });

  it('should rethrow non-VersionError exceptions from .find', () => {
    const reg = createRegistry({ prompts: [def('p', '1.0.0')] });
    const original = reg.get;
    reg.get = (() => {
      throw new RangeError('boom');
    }) as never;
    expect(() => reg.find('p')).toThrow(RangeError);
    reg.get = original;
  });

  it('should list every version of an id sorted descending', () => {
    const reg = createRegistry({
      prompts: [def('p', '1.0.0'), def('p', '2.0.0'), def('p', '1.5.0')],
    });
    const list = reg.list('p');
    expect(list.map((d) => d.version)).toEqual(['2.0.0', '1.5.0', '1.0.0']);
  });

  it('should return an empty array from list() when id is unknown', () => {
    const reg = createRegistry();
    expect(reg.list('missing')).toEqual([]);
  });

  it('should return registered ids via .ids()', () => {
    const reg = createRegistry({
      prompts: [def('a', '1.0.0'), def('b', '1.0.0')],
    });
    expect(new Set(reg.ids())).toEqual(new Set(['a', 'b']));
  });
});

describe('createRegistry — change events', () => {
  it('should emit added events when register is called for a new entry', () => {
    const events: unknown[] = [];
    const reg = createRegistry();
    reg.on('change', (e) => events.push(e));
    reg.register(def('p', '1.0.0'));
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe('added');
  });

  it('should emit replaced events when register replaces an existing entry', () => {
    const reg = createRegistry({ prompts: [def('p', '1.0.0', 'a')] });
    const events: unknown[] = [];
    reg.on('change', (e) => events.push(e));
    reg.register(def('p', '1.0.0', 'b'), { replace: true });
    expect((events[0] as { type: string }).type).toBe('replaced');
  });

  it('should emit removed events when unregister succeeds', () => {
    const reg = createRegistry({ prompts: [def('p', '1.0.0')] });
    const events: unknown[] = [];
    reg.on('change', (e) => events.push(e));
    reg.unregister('p', '1.0.0');
    expect((events[0] as { type: string }).type).toBe('removed');
  });

  it('should not emit when unregister is a no-op', () => {
    const reg = createRegistry();
    const events: unknown[] = [];
    reg.on('change', (e) => events.push(e));
    reg.unregister('missing', '1.0.0');
    expect(events).toHaveLength(0);
  });

  it('should let listeners be removed via the returned unsubscribe function', () => {
    const reg = createRegistry();
    const events: unknown[] = [];
    const off = reg.on('change', (e) => events.push(e));
    off();
    reg.register(def('p', '1.0.0'));
    expect(events).toHaveLength(0);
  });

  it('should swallow exceptions thrown by listeners and continue notifying others', () => {
    const error = vi.spyOn(console, 'error').mockImplementation((): void => undefined);
    const reg = createRegistry();
    reg.on('change', () => {
      throw new Error('boom');
    });
    let receivedSecond = false;
    reg.on('change', () => {
      receivedSecond = true;
    });
    reg.register(def('p', '1.0.0'));
    expect(receivedSecond).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('createRegistry — sources', () => {
  it('should load static records from a memorySource on addSource', async () => {
    const reg = createRegistry();
    const source = memorySource([def('p', '1.0.0').toJSON()]);
    reg.addSource(source);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(reg.find('p')?.version).toBe('1.0.0');
  });

  it('should forward source events through the registry', async () => {
    const listeners = new Set<(event: SourceChangeEvent) => void>();
    const source: PromptSource = {
      name: 'test-source',
      load: async () => [],
      subscribe: (listener) => {
        listeners.add(listener);
        return (): void => {
          listeners.delete(listener);
        };
      },
    };
    const reg = createRegistry();
    const events: unknown[] = [];
    reg.on('change', (e) => events.push(e));
    reg.addSource(source);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    for (const l of listeners) {
      l({ type: 'added', prompt: def('p', '1.0.0').toJSON() });
    }
    expect(events.some((e) => (e as { type?: string }).type === 'added')).toBe(
      true,
    );
  });

  it('should emit error change events when source forwards an error', async () => {
    let listener: ((e: SourceChangeEvent) => void) | undefined;
    const source: PromptSource = {
      name: 's',
      load: async () => [],
      subscribe: (l) => {
        listener = l;
        return (): void => {};
      },
    };
    const reg = createRegistry();
    const events: unknown[] = [];
    reg.on('change', (e) => events.push(e));
    reg.addSource(source);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    const { SourceError } = await import('../errors/source-error.js');
    listener?.({
      type: 'error',
      error: new SourceError('SOURCE_LOAD_FAILED', 'oops'),
    });
    expect(events.some((e) => (e as { type?: string }).type === 'error')).toBe(
      true,
    );
  });

  it('should emit error events when source load rejects', async () => {
    const source: PromptSource = {
      name: 's',
      load: async () => {
        throw new Error('boom');
      },
    };
    const reg = createRegistry();
    const events: unknown[] = [];
    reg.on('change', (e) => events.push(e));
    reg.addSource(source);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(events.some((e) => (e as { type?: string }).type === 'error')).toBe(
      true,
    );
  });

  it('should let an unsubscribe call remove a source', () => {
    const source = memorySource([]);
    const reg = createRegistry();
    const unsub = reg.addSource(source);
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
  });

  it('should clear sources and resolve dispose() promises', async () => {
    const reg = createRegistry();
    let disposed = false;
    const source: PromptSource = {
      name: 's',
      load: async () => [],
      dispose: async () => {
        disposed = true;
      },
    };
    reg.addSource(source);
    await reg.dispose();
    expect(disposed).toBe(true);
  });
});

describe('createTypedRegistry', () => {
  it('should accept a typed map and look up by typed key', () => {
    const greet = def('greet', '1.0.0');
    const reg = createTypedRegistry({
      greet: [greet],
    });
    expect(reg.get('greet').id).toBe('greet');
  });

  it('should accept register / unregister at runtime', () => {
    const reg = createTypedRegistry({});
    reg.register(def('p', '1.0.0'));
    expect(reg.find('p' as never)?.id).toBe('p');
    expect(reg.unregister('p', '1.0.0')).toBe(true);
  });
});
