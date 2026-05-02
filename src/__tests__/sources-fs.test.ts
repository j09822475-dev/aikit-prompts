import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fsSource } from '../sources/fs.js';
import { SourceError } from '../errors/source-error.js';
import { prompt } from '../core/prompt.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'aikit-prompts-fs-'));
  mkdirSync(join(dir, 'sub'), { recursive: true });
  writeFileSync(
    join(dir, 'a.json'),
    JSON.stringify(prompt('a').version('1.0.0').template('hi a').build().toJSON()),
  );
  writeFileSync(
    join(dir, 'sub', 'b.json'),
    JSON.stringify(prompt('b').version('1.0.0').template('hi b').build().toJSON()),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('fsSource — load', () => {
  it('should resolve a single explicit file path', async () => {
    const src = fsSource({ glob: join(dir, 'a.json') });
    const out = await src.load();
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('a');
  });

  it('should resolve a recursive glob via the **/*.json pattern', async () => {
    const src = fsSource({ glob: `${dir}/**/*.json` });
    const out = await src.load();
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('should resolve a non-recursive directory pattern via *.json', async () => {
    const src = fsSource({ glob: `${dir}/*.json` });
    const out = await src.load();
    expect(out).toHaveLength(1);
  });

  it('should return an empty list when the directory does not exist', async () => {
    const src = fsSource({ glob: `${dir}/missing/*.json` });
    const out = await src.load();
    expect(out).toEqual([]);
  });

  it('should accept a custom parser overriding JSON.parse', async () => {
    const src = fsSource({
      glob: join(dir, 'a.json'),
      parser: (raw, _path) =>
        JSON.parse(raw) as ReturnType<typeof JSON.parse>,
    });
    const out = await src.load();
    expect(out).toHaveLength(1);
  });

  it('should default the source name to fs:<glob>:<n>', () => {
    const src = fsSource({ glob: `${dir}/*.json` });
    expect(src.name).toMatch(/^fs:/);
  });

  it('should accept an explicit name option', () => {
    const src = fsSource({ glob: `${dir}/*.json`, name: 'my-fs' });
    expect(src.name).toBe('my-fs');
  });

  it('should expose a no-op subscribe even when watch is false', () => {
    const src = fsSource({ glob: join(dir, 'a.json') });
    const unsub = src.subscribe?.(() => undefined);
    expect(typeof unsub).toBe('function');
    unsub?.();
  });

  it('should emit error events through the listener for malformed file content', async () => {
    const badPath = join(dir, 'bad.json');
    writeFileSync(badPath, 'not json');
    const src = fsSource({ glob: badPath });
    const errors: SourceError[] = [];
    src.subscribe?.((e) => {
      if (e.type === 'error') errors.push(e.error);
    });
    await src.load();
    expect(errors.length).toBeGreaterThan(0);
    rmSync(badPath);
  });

  it('should clean up gracefully via dispose', async () => {
    const src = fsSource({ glob: join(dir, 'a.json') });
    src.subscribe?.(() => undefined);
    await src.dispose?.();
    expect(true).toBe(true);
  });
});
