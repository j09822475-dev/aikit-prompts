import type { PromptDefinition } from '../core/types.js';
import type { PromptSource, SourceChangeEvent } from '../sources/types.js';

export type { PromptSource, SourceChangeEvent };

/** Options accepted by `createRegistry()` / `createTypedRegistry()`. */
export interface RegistryOptions {
  /** Statically registered prompts available immediately. */
  readonly prompts?: ReadonlyArray<PromptDefinition>;
  /** Reject pre-release versions from `'latest'` resolution (default: `true`). */
  readonly excludePrereleaseFromLatest?: boolean;
}

/** Event emitted by `registry.on('change', ...)`. */
export type RegistryChangeEvent =
  | {
      readonly type: 'added' | 'replaced';
      readonly id: string;
      readonly version: string;
      readonly prompt: PromptDefinition;
      readonly sourceName?: string;
    }
  | {
      readonly type: 'removed';
      readonly id: string;
      readonly version: string;
      readonly sourceName?: string;
    }
  | {
      readonly type: 'error';
      readonly error: Error;
      readonly sourceName?: string;
    };

/** Registry-level options for the `register()` mutator. */
export interface RegisterOptions {
  /** When `true`, an existing `(id, version)` pair is overwritten silently. */
  readonly replace?: boolean;
  /** Source name attached to emitted change events (set by hot-reload). */
  readonly sourceName?: string;
}
