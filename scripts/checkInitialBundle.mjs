import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/** Fail closed on absent/incompatible build metadata rather than counting zero bytes. */
export function evaluateInitialBundle(report, budget) {
  if (report?.version !== 1 || !Array.isArray(report.chunks) || report.chunks.length === 0) {
    throw new Error('Missing or incompatible initial bundle report');
  }
  if (!Array.isArray(report.arenaChunks) || report.arenaChunks.length === 0
    || report.arenaChunks.some(name => typeof name !== 'string' || !name.endsWith('.js'))) {
    throw new Error('Missing arena chunk inventory');
  }
  if (!Number.isSafeInteger(budget?.maxInitialGzipBytes) || budget.maxInitialGzipBytes <= 0
    || !Array.isArray(budget.forbiddenModules) || !Array.isArray(budget.forbiddenModulePrefixes)
    || [...budget.forbiddenModules, ...budget.forbiddenModulePrefixes].some(value => typeof value !== 'string' || !value)) {
    throw new Error('Invalid loading budget');
  }
  const seen = new Set();
  let gzipBytes = 0;
  const forbidden = new Set();
  for (const chunk of report.chunks) {
    if (typeof chunk.fileName !== 'string' || !chunk.fileName || seen.has(chunk.fileName)
      || !Number.isSafeInteger(chunk.gzipBytes) || chunk.gzipBytes <= 0
      || !Number.isSafeInteger(chunk.bytes) || chunk.bytes <= 0
      || !Array.isArray(chunk.modules) || chunk.modules.length === 0
      || chunk.modules.some(module => typeof module !== 'string' || !module)) {
      throw new Error('Invalid initial bundle chunk metadata');
    }
    seen.add(chunk.fileName);
    gzipBytes += chunk.gzipBytes;
    for (const module of chunk.modules) {
      const normalized = module.replaceAll('\\', '/').split('?')[0];
      if (budget.forbiddenModules.includes(normalized)
        || budget.forbiddenModulePrefixes.some(prefix => normalized.startsWith(prefix))) {
        forbidden.add(normalized);
      }
    }
  }
  const errors = [];
  if (gzipBytes > budget.maxInitialGzipBytes) {
    errors.push(`Initial JavaScript gzip size ${gzipBytes} bytes exceeds budget ${budget.maxInitialGzipBytes} bytes`);
  }
  if (forbidden.size) errors.push(`Arena gameplay modules loaded eagerly: ${[...forbidden].sort().join(', ')}`);
  return { gzipBytes, maxInitialGzipBytes: budget.maxInitialGzipBytes, chunks: [...seen], errors };
}

export function checkInitialBundle(reportPath = 'dist/.vite/initial-bundle.json') {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const budget = JSON.parse(readFileSync(new URL('./loadingBudget.json', import.meta.url), 'utf8'));
  const result = evaluateInitialBundle(report, budget);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  // Guard against later build hooks changing code after the report was emitted.
  for (const chunk of report.chunks) {
    const code = readFileSync(path.resolve(path.dirname(reportPath), '..', chunk.fileName));
    if (code.byteLength !== chunk.bytes || gzipSync(code).byteLength !== chunk.gzipBytes) {
      throw new Error(`Bundle report differs from emitted file: ${chunk.fileName}`);
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkInitialBundle(process.argv[2]);
}
