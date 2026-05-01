import { parsePromptRecord } from './parse.js';
import type { PromptDefinitionJson, PromptSource, SourceChangeEvent } from './types.js';

let counter = 0;

/**
 * Build an in-memory `PromptSource` from a static list of records.
 * Useful for tests and seeding a registry with imported `.toJSON()`
 * outputs without spinning up a transport.
 *
 * Subscribers receive nothing — the source emits no change events
 * after construction, so registries built from a memory source are
 * effectively static.
 *
 * @param records Static list of `PromptDefinitionJson` records.
 * @param name    Optional source name (default: `'memory:<n>'`).
 * @returns A `PromptSource` synchronously resolving the supplied records.
 *
 * @example
 * const source = memorySource([greetV1.toJSON(), greetV2.toJSON()]);
 * registry.addSource(source);
 */
export function memorySource(
  records: readonly PromptDefinitionJson[],
  name = `memory:${++counter}`,
): PromptSource {
  const validated = records.map((r) => parsePromptRecord(r, name));
  return Object.freeze({
    name,
    load(): Promise<readonly PromptDefinitionJson[]> {
      return Promise.resolve(validated);
    },
    subscribe(_listener: (event: SourceChangeEvent) => void): () => void {
      return (): void => {};
    },
  });
}
