import { SourceError } from '../errors/source-error.js';
import type { PromptDefinitionJson } from '../core/types.js';
import { deepEqual } from '../internal/deep-equal.js';
import { parsePromptRecord } from './parse.js';
import type { PromptSource, SourceChangeEvent } from './types.js';

let counter = 0;

/** Options accepted by `fsSource`. */
export interface FsSourceOptions {
  /**
   * Glob expression. Currently restricted to a directory pattern with a
   * single trailing `**\/*.json` or explicit single-file path.
   */
  readonly glob: string;
  /** When `true`, watch matching files and emit change events on edit. */
  readonly watch?: boolean;
  /** Custom parser invoked with the file contents and absolute path. */
  readonly parser?: (raw: string, path: string) => PromptDefinitionJson;
  /** Optional source name (default: `fs:<glob>`). */
  readonly name?: string;
  /** Watcher debounce in ms (default: 50). */
  readonly debounceMs?: number;
}

interface NodeFsApi {
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
  readdir: (
    path: string,
    options: { withFileTypes: true; recursive?: boolean },
  ) => Promise<Array<{ name: string; isFile(): boolean; parentPath?: string }>>;
  stat: (path: string) => Promise<{ isDirectory(): boolean; isFile(): boolean }>;
  watch: (
    path: string,
    options: { recursive?: boolean },
    listener: (event: string, filename: string | null) => void,
  ) => { close(): void };
}

interface NodePathApi {
  resolve: (...segments: string[]) => string;
  join: (...segments: string[]) => string;
  basename: (path: string) => string;
  dirname: (path: string) => string;
}

const loadNodeModules = async (): Promise<{
  fs: NodeFsApi;
  path: NodePathApi;
}> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsMod = (await import('node:fs/promises')) as unknown as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsSync = (await import('node:fs')) as unknown as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pathMod = (await import('node:path')) as unknown as any;
    return {
      fs: {
        readFile: fsMod.readFile.bind(fsMod),
        readdir: fsMod.readdir.bind(fsMod),
        stat: fsMod.stat.bind(fsMod),
        watch: fsSync.watch.bind(fsSync),
      },
      path: pathMod.default ?? pathMod,
    };
  } catch (cause) {
    throw new SourceError(
      'SOURCE_FS_UNAVAILABLE',
      `fsSource() requires Node-style 'node:fs' / 'node:path' — not available in this runtime.`,
      { cause },
    );
  }
};

const splitGlob = (
  glob: string,
  path: NodePathApi,
): { dir: string; recursive: boolean; suffix: string } => {
  const recursiveMarker = '/**/';
  const idx = glob.indexOf(recursiveMarker);
  if (idx >= 0) {
    return {
      dir: path.resolve(glob.slice(0, idx)),
      recursive: true,
      suffix: glob.slice(idx + recursiveMarker.length),
    };
  }
  const lastSlash = Math.max(glob.lastIndexOf('/'), glob.lastIndexOf('\\'));
  if (lastSlash < 0) return { dir: path.resolve('.'), recursive: false, suffix: glob };
  return {
    dir: path.resolve(glob.slice(0, lastSlash)),
    recursive: false,
    suffix: glob.slice(lastSlash + 1),
  };
};

const matchesSuffix = (filename: string, suffix: string): boolean => {
  if (suffix.startsWith('*.')) return filename.endsWith(suffix.slice(1));
  if (suffix === '*') return true;
  return filename === suffix;
};

const collectFiles = async (
  fs: NodeFsApi,
  path: NodePathApi,
  glob: string,
): Promise<string[]> => {
  const { dir, recursive, suffix } = splitGlob(glob, path);
  let stat;
  try {
    stat = await fs.stat(dir);
  } catch {
    return [];
  }
  if (stat.isFile()) return [dir];
  if (!stat.isDirectory()) return [];

  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!matchesSuffix(entry.name, suffix)) continue;
    const parent = entry.parentPath ?? dir;
    out.push(path.join(parent, entry.name));
  }
  return out.sort();
};

const loadAll = async (
  fs: NodeFsApi,
  path: NodePathApi,
  glob: string,
  parser: (raw: string, path: string) => PromptDefinitionJson,
  sourceName: string,
  onError?: (error: SourceError) => void,
): Promise<readonly PromptDefinitionJson[]> => {
  const files = await collectFiles(fs, path, glob);
  const out: PromptDefinitionJson[] = [];
  for (const file of files) {
    try {
      const text = await fs.readFile(file, 'utf8');
      out.push(parser(text, file));
    } catch (e) {
      const wrapped =
        e instanceof SourceError
          ? e
          : new SourceError(
              'SOURCE_PARSE_FAILED',
              `fsSource '${sourceName}' failed to load '${file}'`,
              { sourceName, cause: e },
            );
      if (onError) onError(wrapped);
      else throw wrapped;
    }
  }
  return out;
};

/**
 * Build a Node-only filesystem-backed `PromptSource`. Lazy-imports
 * `node:fs/promises` and `node:path` inside `load()` so edge bundlers
 * never pull Node modules unless the subpath is statically imported.
 *
 * The supported glob is intentionally limited: a directory plus a
 * trailing `**\/*.json` or explicit filename. Complex glob expressions
 * are out of scope to keep the dep-free guarantee.
 *
 * @param options Source configuration: `glob`, `watch`, `parser`, `name`, `debounceMs`.
 * @returns A `PromptSource`.
 *
 * @throws {SourceError} (`code: 'SOURCE_FS_UNAVAILABLE'`) when `node:fs` is unavailable.
 *
 * @example
 * fsSource({ glob: './prompts/**\/*.json', watch: true });
 */
export function fsSource(options: FsSourceOptions): PromptSource {
  const name = options.name ?? `fs:${options.glob}:${++counter}`;
  const debounceMs = options.debounceMs ?? 50;
  const parser =
    options.parser ??
    ((raw: string, path: string): PromptDefinitionJson =>
      parsePromptRecord(JSON.parse(raw), name + ':' + path));

  let watcher: { close(): void } | undefined;
  const listeners = new Set<(event: SourceChangeEvent) => void>();
  let cached: readonly PromptDefinitionJson[] = [];

  const emit = (event: SourceChangeEvent): void => {
    for (const l of listeners) l(event);
  };

  const startWatch = async (): Promise<void> => {
    if (!options.watch || watcher) return;
    const { fs, path } = await loadNodeModules();
    const { dir, recursive } = splitGlob(options.glob, path);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      watcher = fs.watch(dir, { recursive: recursive }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void (async (): Promise<void> => {
            const previous = cached;
            const next = await loadAll(
              fs,
              path,
              options.glob,
              parser,
              name,
              (err) => emit({ type: 'error', error: err }),
            );
            cached = next;
            diffAndEmit(previous, next, emit);
          })();
        }, debounceMs);
      });
    } catch (cause) {
      emit({
        type: 'error',
        error: new SourceError(
          'SOURCE_LOAD_FAILED',
          `fsSource '${name}' could not watch '${dir}'`,
          { sourceName: name, cause },
        ),
      });
    }
  };

  return Object.freeze({
    name,
    async load(): Promise<readonly PromptDefinitionJson[]> {
      const { fs, path } = await loadNodeModules();
      cached = await loadAll(fs, path, options.glob, parser, name, (err) =>
        emit({ type: 'error', error: err }),
      );
      return cached;
    },
    subscribe(listener: (event: SourceChangeEvent) => void): () => void {
      listeners.add(listener);
      void startWatch();
      return (): void => {
        listeners.delete(listener);
      };
    },
    async dispose(): Promise<void> {
      if (watcher) {
        watcher.close();
        watcher = undefined;
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
    else if (!deepEqual(old, r)) emit({ type: 'replaced', prompt: r });
  }
  for (const r of previous) {
    if (!seen.has(keyOf(r)) && r.version !== undefined) {
      emit({ type: 'removed', id: r.id, version: r.version });
    }
  }
};
