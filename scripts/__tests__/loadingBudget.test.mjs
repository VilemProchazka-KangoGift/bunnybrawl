// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { collectInitialChunks } from '../initialBundleReport.ts';
import { checkInitialBundle, evaluateInitialBundle } from '../checkInitialBundle.mjs';

const budget = {
  maxInitialGzipBytes: 100,
  forbiddenModulePrefixes: ['src/engine/arenas/packs/'],
  forbiddenModules: ['src/engine/arenas/builtin.ts'],
};
const chunk = (fileName, imports = [], isEntry = false) => ({
  fileName, imports, isEntry, code: 'export const value = 1;', modules: { 'src/App.tsx': {} },
});
const reportChunk = (fileName, gzipBytes, modules = ['src/App.tsx']) => ({
  fileName, gzipBytes, bytes: gzipBytes * 3, modules,
});
const report = (...chunks) => ({ version: 1, chunks, arenaChunks: ['assets/arena.js'] });

describe('initial bundle graph', () => {
  it('counts transitive shared chunks once, tolerates cycles, and excludes dynamic-only chunks', () => {
    const chunks = [
      chunk('entry.js', ['shared.js', 'vendor.js'], true),
      chunk('shared.js', ['vendor.js']), chunk('vendor.js', ['shared.js']),
      chunk('Match.js', ['arena.js']), chunk('arena.js'),
    ];
    expect(collectInitialChunks(chunks).map(chunk => chunk.fileName))
      .toEqual(['entry.js', 'shared.js', 'vendor.js']);
  });

  it('counts every entry instead of silently choosing one', () => {
    expect(collectInitialChunks([chunk('a.js', [], true), chunk('b.js', [], true)]))
      .toHaveLength(2);
  });

  it('fails closed if the entry or a static dependency is missing', () => {
    expect(() => collectInitialChunks([chunk('lazy.js')])).toThrow('No JavaScript entry');
    expect(() => collectInitialChunks([chunk('entry.js', ['missing.js'], true)]))
      .toThrow('Missing static dependency');
  });
});

describe('initial bundle budget', () => {
  it('allows the exact budget and lightweight arena preview metadata', () => {
    const result = evaluateInitialBundle(report(reportChunk('entry.js', 100,
      ['src/engine/arenas/previewCatalog.ts', 'src/engine/arenas/loading.ts'])), budget);
    expect(result.gzipBytes).toBe(100);
    expect(result.errors).toEqual([]);
  });

  it('fails when a shared static dependency pushes the total over budget', () => {
    const result = evaluateInitialBundle(report(
      reportChunk('entry.js', 80), reportChunk('shared.js', 21)), budget);
    expect(result.gzipBytes).toBe(101);
    expect(result.errors).toEqual([expect.stringContaining('exceeds budget')]);
  });

  it('rejects arena modules even below budget, independent of chunk names and path separators', () => {
    const result = evaluateInitialBundle(report(reportChunk('innocent-shared.js', 20, [
      'src/engine/arenas/builtin.ts', 'src\\engine\\arenas\\packs\\meadow.ts?query',
    ])), budget);
    expect(result.errors).toEqual([expect.stringContaining(
      'src/engine/arenas/builtin.ts, src/engine/arenas/packs/meadow.ts')]);
  });

  it('reports size and eager-load violations together', () => {
    expect(evaluateInitialBundle(report(reportChunk('entry.js', 101,
      ['src/engine/arenas/packs/lobby.ts'])), budget).errors).toHaveLength(2);
  });

  it.each([
    null, { version: 2, chunks: [] }, report(),
    { ...report(reportChunk('entry.js', 20)), arenaChunks: [] },
    report(reportChunk('entry.js', 0)),
    report(reportChunk('entry.js', 20, [])),
    report(reportChunk('same.js', 20), reportChunk('same.js', 20)),
  ])('fails closed on invalid report %j', input => {
    expect(() => evaluateInitialBundle(input, budget)).toThrow();
  });

  it('rejects an invalid budget', () => {
    expect(() => evaluateInitialBundle(report(reportChunk('entry.js', 20)),
      { ...budget, maxInitialGzipBytes: 0 })).toThrow('Invalid loading budget');
  });

  it('rejects a report measured before a later build hook changes the emitted bytes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'loading-budget-'));
    try {
      mkdirSync(path.join(root, '.vite'));
      const code = 'export const value = 1;';
      writeFileSync(path.join(root, 'entry.js'), code + '\n// later preload helper');
      const reportPath = path.join(root, '.vite', 'initial-bundle.json');
      writeFileSync(reportPath, JSON.stringify(report({
        fileName: 'entry.js', bytes: Buffer.byteLength(code),
        gzipBytes: gzipSync(code).byteLength, modules: ['src/App.tsx'],
      })));
      expect(() => checkInitialBundle(reportPath)).toThrow('differs from emitted file');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
