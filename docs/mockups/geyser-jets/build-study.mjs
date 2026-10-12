import fs from 'node:fs';
import ts from 'typescript';
import { build } from 'vite';
const source = fs.readFileSync(new URL('baseline-zones.ts.txt', import.meta.url), 'utf8');
const start = source.indexOf('export function drawGeyser(');
const end = source.indexOf('export function drawBouncyPlatformOverlay', start);
fs.writeFileSync(new URL('baseline.js', import.meta.url), ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText);
await build({ configFile: false, base: '/bunnybrawl/', define: { __BUILD_TIME__: JSON.stringify('study') },
  build: { outDir: 'test-results/geyser-static', emptyOutDir: true,
    rolldownOptions: { input: 'docs/mockups/geyser-jets/index.html' } } });
