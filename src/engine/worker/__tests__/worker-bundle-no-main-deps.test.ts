/**
 * Regression: the worker entry's transitive imports must NOT include any
 * main-thread-only dependencies. The worker bundle is browser-only but ships
 * separately from the React/UI bundle; pulling in React or Howler from the
 * worker would silently double the download size and break worker boot.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_ENTRY = resolve(HERE, '..', 'renderWorker.ts');

const FORBIDDEN_BARE = [
  'react',
  'react-dom',
  '@vitejs/plugin-react',
  'howler',
  'trystero',
  '@trystero-p2p/mqtt',
  'i18next',
  'react-i18next',
  'zustand',
];

const STATIC_RE = /(?:^|[\s;])(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /(?:^|[\s;])import\s+['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiersOf(source: string): string[] {
  const out: string[] = [];
  for (const re of [STATIC_RE, SIDE_EFFECT_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) != null) {
      out.push(m[1]);
    }
  }
  return out;
}

function resolveLocal(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    base + '.ts',
    base + '.tsx',
    base + '.js',
    base + '.mjs',
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch { /* skip */ }
  }
  return null;
}

function isForbiddenBare(spec: string): boolean {
  for (const bare of FORBIDDEN_BARE) {
    if (spec === bare) return true;
    if (spec.startsWith(bare + '/')) return true;
  }
  return false;
}

interface Walk {
  visited: Set<string>;
  bareImports: Map<string, string>;
}

function walk(file: string, w: Walk): void {
  if (w.visited.has(file)) return;
  w.visited.add(file);
  const src = readFileSync(file, 'utf8');
  for (const spec of specifiersOf(src)) {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const local = resolveLocal(file, spec);
      if (local) walk(local, w);
      continue;
    }
    if (!w.bareImports.has(spec)) {
      w.bareImports.set(spec, file);
    }
  }
}

describe('worker bundle no main deps', () => {
  it('renderWorker entry resolves to a real file', () => {
    expect(existsSync(WORKER_ENTRY)).toBe(true);
  });

  it('does not transitively import main-thread modules', () => {
    const w: Walk = { visited: new Set(), bareImports: new Map() };
    walk(WORKER_ENTRY, w);

    const offenders: { module: string; importedBy: string }[] = [];
    for (const [bare, importedBy] of w.bareImports) {
      if (isForbiddenBare(bare)) {
        offenders.push({ module: bare, importedBy });
      }
    }

    if (offenders.length > 0) {
      const lines = offenders.map(
        (o) => '  - ' + o.module + '  (imported by ' + o.importedBy + ')',
      );
      throw new Error(
        'Worker bundle contains forbidden imports:\n' + lines.join('\n'),
      );
    }
    expect(offenders).toHaveLength(0);
  });

  it('exposes a non-empty visited graph (sanity check on the walker)', () => {
    const w: Walk = { visited: new Set(), bareImports: new Map() };
    walk(WORKER_ENTRY, w);
    expect(w.visited.size).toBeGreaterThanOrEqual(1);
  });
});
