import type { PromptDefinitionJson } from '../core/types.js';
import type { SourceError } from '../errors/source-error.js';

export type { PromptDefinitionJson };

/**
 * Async event emitted by a `PromptSource.subscribe` listener. Mirrors
 * the registry's `RegistryChangeEvent` minus the `replaced` event,
 * which the registry derives from `added` against an existing entry.
 */
export type SourceChangeEvent =
  | { readonly type: 'added'; readonly prompt: PromptDefinitionJson }
  | { readonly type: 'replaced'; readonly prompt: PromptDefinitionJson }
  | {
      readonly type: 'removed';
      readonly id: string;
      readonly version: string;
    }
  | { readonly type: 'error'; readonly error: SourceError };

/**
 * A `PromptSource` is a polled or push-based provider of serialized
 * prompt definitions. Registries subscribe to sources to build a
 * hot-reloadable registry without coupling the registry to any
 * particular transport (filesystem, HTTP, KV, in-memory).
 */
export interface PromptSource {
  readonly name: string;
  /**
   * Initial load. Returns all prompts known to this source.
   *
   * @throws {SourceError} on transport or parse failure.
   */
  load(): Promise<readonly PromptDefinitionJson[]>;
  /**
   * Optional subscription. If provided, the registry will call it once
   * per source and forward each emission to its `change` listeners.
   *
   * The returned unsubscribe is **synchronous** — React `useEffect`
   * cleanup, `finally` blocks, and signal handlers can call it
   * directly. Sources that need to flush async I/O during teardown
   * should expose `dispose()` separately.
   */
  subscribe?(listener: (event: SourceChangeEvent) => void): () => void;
  /** Optional async cleanup invoked by `registry.dispose()`. */
  dispose?(): Promise<void>;
}

/** Verifier signature for `httpSource({ verify })`. */
export type VerifyFn = (
  body: string,
  response: Response,
) => boolean | Promise<boolean>;
