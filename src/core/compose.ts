import {
  CacheBreakpointLimitError,
  ToolSchemaError,
} from '../errors/misc-errors.js';
import { VariableError } from '../errors/variable-error.js';
import type { ChatMessage } from '../types/message.js';
import type { Result } from '../types/result.js';
import type { Role } from '../types/role.js';
import type { UnionToIntersection } from '../types/partial-vars.js';
import { renderAst } from './template.js';
import type {
  Block,
  ComposeOptions,
  Composition,
  RenderOptions,
  Tool,
} from './types.js';

const ANTHROPIC_CACHE_BREAKPOINT_LIMIT = 4;

let warnedOnBreakpointLimit = false;

const warnBreakpointLimit = (count: number): void => {
  if (warnedOnBreakpointLimit) return;
  warnedOnBreakpointLimit = true;
  // eslint-disable-next-line no-console
  console.warn(
    new CacheBreakpointLimitError(count).message,
  );
};

/**
 * Compose blocks into a chat-style template.
 *
 * The returned `Composition` aggregates all variables across blocks, so
 * `.render()` requires the union of every block's inputs. Optional
 * `tools` / `responseSchema` / `cache` flow into adapter output.
 *
 * @param blocks  Ordered list of `Block`s (built from `block(role).build()`).
 * @param options Optional id, version, tools, structured-output schema, cache mode.
 * @returns The frozen `Composition`.
 *
 * @throws {ToolSchemaError} when two tools in `options.tools` share the same `name`.
 *
 * @example
 * const chat = compose([system, userTurn], { tools: [searchTool] });
 * const messages = chat.render({ persona: 'helpful', question: 'Why TS?' });
 */
export function compose<
  TBlocks extends ReadonlyArray<Block<Role, Record<string, unknown>>>,
>(
  blocks: TBlocks,
  options?: ComposeOptions,
): Composition<
  UnionToIntersection<
    TBlocks[number] extends Block<Role, infer V> ? V : never
  > extends infer U
    ? U extends Record<string, unknown>
      ? U
      : Record<string, unknown>
    : Record<string, unknown>
> {
  const tools = options?.tools ?? [];
  validateUniqueTools(tools);

  const cacheBlocks = blocks.filter((b) => b.cacheBreakpoint);
  if (cacheBlocks.length > ANTHROPIC_CACHE_BREAKPOINT_LIMIT) {
    warnBreakpointLimit(cacheBlocks.length);
  }

  const cache: 'auto' | 'off' = options?.cache ?? 'auto';

  const composition: Composition<Record<string, unknown>> = Object.freeze({
    ...(options?.id !== undefined ? { id: options.id } : {}),
    ...(options?.version !== undefined ? { version: options.version } : {}),
    blocks: Object.freeze([...blocks]) as readonly Block[],
    tools: Object.freeze([...tools]) as readonly Tool[],
    ...(options?.responseSchema !== undefined
      ? { responseSchema: options.responseSchema }
      : {}),
    cache,

    render(
      vars: Record<string, unknown>,
      renderOpts?: RenderOptions,
    ): readonly ChatMessage[] {
      return renderBlocks(
        blocks,
        vars,
        renderOpts,
        cache,
        cacheBlocks.length,
      );
    },

    tryRender(
      vars: Record<string, unknown>,
      renderOpts?: RenderOptions,
    ): Result<readonly ChatMessage[], VariableError> {
      try {
        return {
          ok: true,
          value: renderBlocks(
            blocks,
            vars,
            renderOpts,
            cache,
            cacheBlocks.length,
          ),
        };
      } catch (e) {
        if (e instanceof VariableError) return { ok: false, error: e };
        throw e;
      }
    },

    renderText(
      vars: Record<string, unknown>,
      renderOpts?: RenderOptions,
    ): string {
      const messages = renderBlocks(
        blocks,
        vars,
        renderOpts,
        cache,
        cacheBlocks.length,
      );
      return messages
        .map((m) => (typeof m.content === 'string' ? m.content : ''))
        .filter((s) => s.length > 0)
        .join('\n\n');
    },

    variables(): readonly string[] {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const b of blocks) {
        if (!b._ast) continue;
        for (const v of b._ast.variables) {
          if (Object.prototype.hasOwnProperty.call(b.partial, v)) continue;
          if (!seen.has(v)) {
            seen.add(v);
            out.push(v);
          }
        }
      }
      return out;
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return composition as any;
}

const validateUniqueTools = (
  tools: ReadonlyArray<Tool<string, unknown>>,
): void => {
  const seen = new Set<string>();
  for (const t of tools) {
    if (seen.has(t.name)) {
      throw new ToolSchemaError(
        `Duplicate tool name '${t.name}' in compose({ tools })`,
        t.name,
      );
    }
    seen.add(t.name);
  }
};

const renderBlocks = (
  blocks: ReadonlyArray<Block<Role, Record<string, unknown>>>,
  vars: Record<string, unknown>,
  options: RenderOptions | undefined,
  cache: 'auto' | 'off',
  totalBreakpoints: number,
): readonly ChatMessage[] => {
  const out: ChatMessage[] = [];
  let breakpointsEmitted = 0;
  const breakpointsToHonor = Math.min(
    totalBreakpoints,
    ANTHROPIC_CACHE_BREAKPOINT_LIMIT,
  );
  const breakpointsToSkip = totalBreakpoints - breakpointsToHonor;
  let breakpointsSeen = 0;

  for (const b of blocks) {
    if (b.examples.length > 0) {
      for (const ex of b.examples) {
        out.push({ role: 'user', content: ex.user });
        out.push({ role: 'assistant', content: ex.assistant });
      }
    }

    if (b.template !== undefined && b._ast) {
      const blockOptions: RenderOptions = {
        ...(options?.escape !== undefined ? { escape: options.escape } : {}),
        strict: false,
      };
      const text = renderAst(
        b._ast,
        vars,
        b.partial,
        blockOptions,
        undefined,
      );
      const message: ChatMessage = { role: b.role, content: text };

      const honorBreakpoint =
        b.cacheBreakpoint && cache === 'auto' && (() => {
          breakpointsSeen++;
          if (breakpointsSeen <= breakpointsToSkip) return false;
          breakpointsEmitted++;
          return true;
        })();

      out.push(
        honorBreakpoint
          ? { ...message, cacheControl: 'ephemeral' as const }
          : message,
      );
    } else if (b.cacheBreakpoint && out.length > 0) {
      const last = out[out.length - 1];
      if (cache === 'auto' && last !== undefined) {
        breakpointsSeen++;
        if (breakpointsSeen > breakpointsToSkip) {
          breakpointsEmitted++;
          out[out.length - 1] = { ...last, cacheControl: 'ephemeral' };
        }
      }
    }
  }

  if (breakpointsEmitted > ANTHROPIC_CACHE_BREAKPOINT_LIMIT) {
    warnBreakpointLimit(breakpointsEmitted);
  }

  return Object.freeze(out);
};
