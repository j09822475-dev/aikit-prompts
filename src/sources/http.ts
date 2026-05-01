import { SourceError } from '../errors/source-error.js';
import type { PromptDefinitionJson } from '../core/types.js';
import { parsePromptRecords } from './parse.js';
import type {
  PromptSource,
  SourceChangeEvent,
  VerifyFn,
} from './types.js';

let counter = 0;

/** Options accepted by `httpSource`. */
export interface HttpSourceOptions {
  /** Endpoint returning a JSON array of `PromptDefinitionJson` records. */
  readonly url: string;
  /** Custom `fetch` implementation (e.g. for tests / proxies). */
  readonly fetch?: typeof fetch;
  /** Headers attached to every request. */
  readonly headers?: HeadersInit;
  /** Cache the last successful response for `ttlMs` milliseconds. */
  readonly ttlMs?: number;
  /** Custom parser if the endpoint returns a non-array shape. */
  readonly parser?: (raw: unknown) => readonly PromptDefinitionJson[];
  /**
   * Integrity check applied to every successful fetch. Returning
   * `false` (or rejecting) emits a `SOURCE_INTEGRITY_FAILED` change
   * event and the previous successful load remains in effect.
   */
  readonly verify?: VerifyFn;
  /**
   * Optional explicit name. Defaults to `http:<url>`. Useful when
   * multiple endpoints share an origin.
   */
  readonly name?: string;
  /** Optional polling interval in ms — when set, source emits change events on each refresh. */
  readonly pollMs?: number;
}

const fetchAndValidate = async (
  options: HttpSourceOptions,
  fetchFn: typeof fetch,
): Promise<readonly PromptDefinitionJson[]> => {
  let response: Response;
  try {
    response = await fetchFn(options.url, {
      method: 'GET',
      ...(options.headers !== undefined ? { headers: options.headers } : {}),
    });
  } catch (cause) {
    throw new SourceError(
      'SOURCE_LOAD_FAILED',
      `httpSource '${options.url}' fetch failed`,
      { url: options.url, cause },
    );
  }

  if (!response.ok) {
    throw new SourceError(
      'SOURCE_LOAD_FAILED',
      `httpSource '${options.url}' returned HTTP ${response.status}`,
      { url: options.url },
    );
  }

  const body = await response.text();

  if (options.verify) {
    let ok = false;
    try {
      ok = await options.verify(body, response);
    } catch (cause) {
      throw new SourceError(
        'SOURCE_INTEGRITY_FAILED',
        `httpSource '${options.url}' verify callback threw`,
        { url: options.url, cause },
      );
    }
    if (!ok) {
      throw new SourceError(
        'SOURCE_INTEGRITY_FAILED',
        `httpSource '${options.url}' integrity check failed`,
        { url: options.url },
      );
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    throw new SourceError(
      'SOURCE_PARSE_FAILED',
      `httpSource '${options.url}' returned invalid JSON`,
      { url: options.url, cause },
    );
  }

  if (options.parser) {
    return options.parser(parsed);
  }

  if (!Array.isArray(parsed)) {
    throw new SourceError(
      'SOURCE_PARSE_FAILED',
      `httpSource '${options.url}' did not return a JSON array — supply a 'parser' option`,
      { url: options.url },
    );
  }

  const sourceName = options.name ?? `http:${options.url}`;
  return parsePromptRecords(parsed, sourceName);
};

/**
 * Build an HTTP-backed `PromptSource`. Edge-safe — uses the global
 * `fetch` with no Node imports. Optional `verify` hook authenticates
 * the response body (see `verifyHmac`).
 *
 * @param options Source configuration: `url`, optional `fetch`,
 *                `headers`, `ttlMs`, `parser`, `verify`, `name`, `pollMs`.
 * @returns A `PromptSource` suitable for `registry.addSource()`.
 *
 * @example
 * httpSource({
 *   url: 'https://kv.example.com/prompts.json',
 *   ttlMs: 60_000,
 *   verify: verifyHmac({ secret, headerName: 'x-prompt-signature' }),
 * });
 */
export function httpSource(options: HttpSourceOptions): PromptSource {
  const fetchFn = options.fetch ?? fetch;
  const name = options.name ?? `http:${options.url}:${++counter}`;
  let cached: readonly PromptDefinitionJson[] | undefined;
  let cachedAt = 0;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<(event: SourceChangeEvent) => void>();

  const emit = (event: SourceChangeEvent): void => {
    for (const l of listeners) l(event);
  };

  const loadOnce = async (): Promise<readonly PromptDefinitionJson[]> => {
    if (
      options.ttlMs !== undefined &&
      cached !== undefined &&
      Date.now() - cachedAt < options.ttlMs
    ) {
      return cached;
    }
    try {
      const records = await fetchAndValidate(options, fetchFn);
      cached = records;
      cachedAt = Date.now();
      return records;
    } catch (e) {
      if (e instanceof SourceError) {
        emit({ type: 'error', error: e });
        if (cached) return cached;
        throw e;
      }
      throw e;
    }
  };

  const startPolling = (): void => {
    if (options.pollMs === undefined || pollTimer) return;
    pollTimer = setInterval(() => {
      void (async (): Promise<void> => {
        const previous = cached ?? [];
        cached = undefined;
        cachedAt = 0;
        let next: readonly PromptDefinitionJson[];
        try {
          next = await loadOnce();
        } catch {
          return;
        }
        diffAndEmit(previous, next, emit);
      })();
    }, options.pollMs);
  };

  return Object.freeze({
    name,
    load: loadOnce,
    subscribe(listener: (event: SourceChangeEvent) => void): () => void {
      listeners.add(listener);
      startPolling();
      return (): void => {
        listeners.delete(listener);
      };
    },
    async dispose(): Promise<void> {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      listeners.clear();
    },
  });
}

const keyOf = (r: PromptDefinitionJson): string =>
  `${r.id}@${r.version ?? ''}`;

const diffAndEmit = (
  previous: readonly PromptDefinitionJson[],
  next: readonly PromptDefinitionJson[],
  emit: (event: SourceChangeEvent) => void,
): void => {
  const prev = new Map<string, PromptDefinitionJson>();
  for (const r of previous) prev.set(keyOf(r), r);
  const seen = new Set<string>();
  for (const r of next) {
    const key = keyOf(r);
    seen.add(key);
    const old = prev.get(key);
    if (!old) emit({ type: 'added', prompt: r });
    else if (JSON.stringify(old) !== JSON.stringify(r))
      emit({ type: 'replaced', prompt: r });
  }
  for (const r of previous) {
    if (!seen.has(keyOf(r)) && r.version !== undefined) {
      emit({ type: 'removed', id: r.id, version: r.version });
    }
  }
};
