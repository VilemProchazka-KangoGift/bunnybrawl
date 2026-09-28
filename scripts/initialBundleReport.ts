import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

export interface BundleChunk {
  fileName: string;
  isEntry: boolean;
  imports: string[];
  code: string;
  modules: Record<string, unknown>;
}

/** Follow static imports only; deferred screens and workers aren't menu startup code. */
export function collectInitialChunks(chunks: BundleChunk[]): BundleChunk[] {
  const byName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  const entries = chunks.filter(chunk => chunk.isEntry);
  if (entries.length === 0) throw new Error('No JavaScript entry chunks found');
  const visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name)) return;
    const chunk = byName.get(name);
    if (!chunk) throw new Error(`Missing static dependency: ${name}`);
    visited.add(name);
    chunk.imports.forEach(visit);
  };
  entries.forEach(chunk => visit(chunk.fileName));
  return [...visited].sort().map(name => byName.get(name)!);
}

/** Build metadata lives beside Vite's manifests; no app code is changed. */
export function initialBundleReport(): Plugin {
  let root = '';
  return {
    name: 'initial-bundle-report',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { root = config.root; },
    // Vite injects dynamic-import preload helpers in its normal generateBundle
    // hook. A post hook must measure those final bytes as well.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const chunks = Object.values(bundle).filter(chunk => chunk.type === 'chunk');
        const moduleNames = (chunk: BundleChunk) => Object.keys(chunk.modules)
          .map(id => path.relative(root, id).replaceAll('\\', '/')).sort();
        const initial = collectInitialChunks(chunks).map(chunk => ({
          fileName: chunk.fileName,
          bytes: Buffer.byteLength(chunk.code),
          gzipBytes: gzipSync(chunk.code).byteLength,
          modules: moduleNames(chunk),
        }));
        const arenaChunks = chunks.filter(chunk => moduleNames(chunk).some(id =>
          id.startsWith('src/engine/arenas/packs/') || id.split('?')[0] === 'src/engine/arenas/builtin.ts'))
          .map(chunk => chunk.fileName).sort();
        this.emitFile({
          type: 'asset',
          fileName: '.vite/initial-bundle.json',
          source: JSON.stringify({ version: 1, chunks: initial, arenaChunks }, null, 2) + '\n',
        });
      },
    },
  };
}
