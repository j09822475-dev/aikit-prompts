import {
  RegistryDuplicateError,
} from '../errors/misc-errors.js';
import { SourceError } from '../errors/source-error.js';
import { VersionError } from '../errors/version-error.js';
import { fromJSON } from '../core/prompt.js';
import type { PromptDefinition } from '../core/types.js';
import type {
  PromptSource,
  SourceChangeEvent,
} from '../sources/types.js';
import { compare, parse } from './semver.js';
import {
  indexRecords,
  selectVersion,
} from './selector.js';
import type {
  RegisterOptions,
  RegistryChangeEvent,
  RegistryOptions,
} from './types.js';

/** Loose-typed dynamic registry. Returned by `createRegistry()`. */
export interface PromptRegistry {
  /**
   * Look up a prompt by id and an optional selector.
   *
   * @param id       Prompt id.
   * @param selector SemVer string or range. `undefined` selects the latest.
   * @returns The matching `PromptDefinition`.
   *
   * @throws {VersionError} when no version satisfies the selector.
   */
  get(id: string, selector?: string): PromptDefinition;
  /** Like `get`, but returns `undefined` instead of throwing. */
  find(id: string, selector?: string): PromptDefinition | undefined;
  list(id: string): readonly PromptDefinition[];
  ids(): readonly string[];
  register(def: PromptDefinition, options?: RegisterOptions): void;
  unregister(id: string, version: string): boolean;
  /** Attach a hot-reload source. Returns a synchronous unsubscribe function. */
  addSource(source: PromptSource): () => void;
  on(
    event: 'change',
    listener: (e: RegistryChangeEvent) => void,
  ): () => void;
  dispose(): Promise<void>;
}

/** Typed registry over a static `{ [id]: PromptDefinition[] }` map. */
export interface TypedPromptRegistry<
  TMap extends Record<
    string,
    ReadonlyArray<PromptDefinition<Record<string, unknown>, string | undefined>>
  >,
> {
  /**
   * Look up a prompt by id and an optional selector. `id` is constrained
   * to the keys of `TMap`, and the return type carries the precise
   * `PromptDefinition<TVars>` registered for that id.
   *
   * @param id       Prompt id (typed in `TMap`).
   * @param selector SemVer string or range. `undefined` selects the latest.
   *
   * @throws {VersionError} when no version satisfies the selector.
   */
  get<K extends keyof TMap & string>(
    id: K,
    selector?: string,
  ): TMap[K][number];
  find<K extends keyof TMap & string>(
    id: K,
    selector?: string,
  ): TMap[K][number] | undefined;
  list<K extends keyof TMap & string>(id: K): TMap[K];
  ids(): ReadonlyArray<keyof TMap & string>;
  register(def: PromptDefinition, options?: RegisterOptions): void;
  unregister(id: string, version: string): boolean;
  addSource(source: PromptSource): () => void;
  on(
    event: 'change',
    listener: (e: RegistryChangeEvent) => void,
  ): () => void;
  dispose(): Promise<void>;
}

interface InternalState {
  /** id → version-string → definition */
  readonly entries: Map<string, Map<string, PromptDefinition>>;
  readonly sources: Map<PromptSource, () => void>;
  readonly listeners: Set<(e: RegistryChangeEvent) => void>;
  readonly excludePrereleaseFromLatest: boolean;
  /** Pending in-flight loads tracked for `dispose()`. */
  readonly pending: Set<Promise<unknown>>;
}

const emit = (state: InternalState, event: RegistryChangeEvent): void => {
  for (const listener of state.listeners) {
    try {
      listener(event);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[@aikit/prompts] registry listener threw:', e);
    }
  }
};

const registerInternal = (
  state: InternalState,
  def: PromptDefinition,
  options: RegisterOptions,
): void => {
  if (typeof def.version !== 'string') {
    throw new VersionError(
      'VERSION_INVALID',
      `Cannot register '${def.id}' — no version supplied`,
      { id: def.id },
    );
  }
  parse(def.version);

  let bucket = state.entries.get(def.id);
  if (!bucket) {
    bucket = new Map();
    state.entries.set(def.id, bucket);
  }
  const existing = bucket.get(def.version);
  if (existing && !options.replace) {
    throw new RegistryDuplicateError(def.id, def.version);
  }
  bucket.set(def.version, def);
  emit(state, {
    type: existing ? 'replaced' : 'added',
    id: def.id,
    version: def.version,
    prompt: def,
    ...(options.sourceName !== undefined
      ? { sourceName: options.sourceName }
      : {}),
  });
};

const unregisterInternal = (
  state: InternalState,
  id: string,
  version: string,
  sourceName: string | undefined,
): boolean => {
  const bucket = state.entries.get(id);
  if (!bucket) return false;
  const removed = bucket.delete(version);
  if (removed) {
    if (bucket.size === 0) state.entries.delete(id);
    emit(state, {
      type: 'removed',
      id,
      version,
      ...(sourceName !== undefined ? { sourceName } : {}),
    });
  }
  return removed;
};

const subscribeToSource = (
  state: InternalState,
  source: PromptSource,
): (() => void) => {
  const handler = (event: SourceChangeEvent): void => {
    try {
      switch (event.type) {
        case 'added':
        case 'replaced':
          registerInternal(state, fromJSON(event.prompt), {
            replace: true,
            sourceName: source.name,
          });
          break;
        case 'removed':
          unregisterInternal(
            state,
            event.id,
            event.version,
            source.name,
          );
          break;
        case 'error':
          emit(state, {
            type: 'error',
            error: event.error,
            sourceName: source.name,
          });
          break;
      }
    } catch (e) {
      emit(state, {
        type: 'error',
        error:
          e instanceof Error
            ? e
            : new SourceError('SOURCE_PARSE_FAILED', String(e), {
                sourceName: source.name,
              }),
        sourceName: source.name,
      });
    }
  };

  const unsub = source.subscribe ? source.subscribe(handler) : (): void => {};

  const loadPromise = source
    .load()
    .then((records) => {
      for (const json of records) {
        try {
          registerInternal(state, fromJSON(json), {
            replace: true,
            sourceName: source.name,
          });
        } catch (e) {
          emit(state, {
            type: 'error',
            error:
              e instanceof Error
                ? e
                : new SourceError('SOURCE_PARSE_FAILED', String(e), {
                    sourceName: source.name,
                  }),
            sourceName: source.name,
          });
        }
      }
    })
    .catch((e: unknown) => {
      emit(state, {
        type: 'error',
        error:
          e instanceof Error
            ? e
            : new SourceError('SOURCE_LOAD_FAILED', String(e), {
                sourceName: source.name,
              }),
        sourceName: source.name,
      });
    });

  state.pending.add(loadPromise);
  loadPromise.finally(() => state.pending.delete(loadPromise));

  let unsubscribed = false;
  return (): void => {
    if (unsubscribed) return;
    unsubscribed = true;
    state.sources.delete(source);
    try {
      unsub();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[@aikit/prompts] source unsubscribe threw:', e);
    }
  };
};

const buildShared = (state: InternalState): {
  get(id: string, selector?: string): PromptDefinition;
  find(id: string, selector?: string): PromptDefinition | undefined;
  list(id: string): readonly PromptDefinition[];
  ids(): readonly string[];
  register(def: PromptDefinition, options?: RegisterOptions): void;
  unregister(id: string, version: string): boolean;
  addSource(source: PromptSource): () => void;
  on(
    event: 'change',
    listener: (e: RegistryChangeEvent) => void,
  ): () => void;
  dispose(): Promise<void>;
} => ({
  get(id, selector): PromptDefinition {
    const bucket = state.entries.get(id);
    if (!bucket || bucket.size === 0) {
      throw new VersionError(
        'VERSION_NOT_FOUND',
        `No prompts registered for id '${id}'`,
        selector !== undefined ? { id, selector } : { id },
      );
    }
    return selectVersion(indexRecords([...bucket.values()]), selector, {
      excludePrereleaseFromLatest: state.excludePrereleaseFromLatest,
    });
  },

  find(id, selector): PromptDefinition | undefined {
    try {
      return this.get(id, selector);
    } catch (e) {
      if (e instanceof VersionError) return undefined;
      throw e;
    }
  },

  list(id): readonly PromptDefinition[] {
    const bucket = state.entries.get(id);
    if (!bucket) return [];
    return [...bucket.values()].sort((a, b) =>
      compare(parse(b.version!), parse(a.version!)),
    );
  },

  ids(): readonly string[] {
    return [...state.entries.keys()];
  },

  register(def, options = {}): void {
    registerInternal(state, def, options);
  },

  unregister(id, version): boolean {
    return unregisterInternal(state, id, version, undefined);
  },

  addSource(source): () => void {
    const unsub = subscribeToSource(state, source);
    state.sources.set(source, unsub);
    return unsub;
  },

  on(_event, listener): () => void {
    state.listeners.add(listener);
    return (): void => {
      state.listeners.delete(listener);
    };
  },

  async dispose(): Promise<void> {
    const sources = [...state.sources.keys()];
    for (const unsub of state.sources.values()) unsub();
    state.sources.clear();
    if (state.pending.size > 0) {
      await Promise.allSettled([...state.pending]);
    }
    await Promise.allSettled(
      sources.filter((s) => s.dispose).map((s) => s.dispose!()),
    );
  },
});

const initState = (options?: RegistryOptions): InternalState => {
  const state: InternalState = {
    entries: new Map(),
    sources: new Map(),
    listeners: new Set(),
    excludePrereleaseFromLatest: options?.excludePrereleaseFromLatest ?? true,
    pending: new Set(),
  };
  if (options?.prompts) {
    for (const def of options.prompts) {
      registerInternal(state, def, {});
    }
  }
  return state;
};

/**
 * Create a dynamic in-memory prompt registry indexed by `(id, version)`.
 *
 * Loose typing — `get()` returns
 * `PromptDefinition<Record<string, unknown>>`. Prefer
 * `createTypedRegistry()` for statically known prompts.
 *
 * @param options Optional initial prompts and pre-release policy.
 * @returns A `PromptRegistry` instance.
 *
 * @example
 * const registry = createRegistry({ prompts: [greetV1] });
 * registry.get('greet', '^1.0.0');
 */
export function createRegistry(options?: RegistryOptions): PromptRegistry {
  const state = initState(options);
  return buildShared(state) as PromptRegistry;
}

/**
 * Create a typed prompt registry from a static `{ id → PromptDefinition[] }`
 * map. Lookups are typed end-to-end — `registry.get(id)` returns the
 * precise `PromptDefinition<TVars>` shape that was registered for `id`,
 * and unknown ids are caught at compile time.
 *
 * Use this in application code where prompts are imported (the common
 * case). Use `createRegistry()` for dynamic registries fed by hot-reload
 * sources.
 *
 * @param map     Map of id → array of `PromptDefinition`s (one per version).
 * @param options Optional pre-release policy and additional prompts.
 * @returns A `TypedPromptRegistry<TMap>`.
 *
 * @example
 * const registry = createTypedRegistry({
 *   'greet.user':  [greetV1, greetV2],
 *   'search.user': [searchV1],
 * });
 */
export function createTypedRegistry<
  const TMap extends Record<
    string,
    ReadonlyArray<
      PromptDefinition<Record<string, unknown>, string | undefined>
    >
  >,
>(map: TMap, options?: RegistryOptions): TypedPromptRegistry<TMap> {
  const state = initState(options);
  for (const [, defs] of Object.entries(map)) {
    for (const d of defs) registerInternal(state, d, {});
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return buildShared(state) as any;
}
