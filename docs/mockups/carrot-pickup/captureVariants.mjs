import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const url = process.argv[2];
if (!url) throw new Error('Usage: node captureVariants.mjs <base-url>');

const source = fileURLToPath(new URL('../../../src/engine/rendering/collectibles.ts', import.meta.url));
const capture = fileURLToPath(new URL('./capture.mjs', import.meta.url));
const original = readFileSync(source, 'utf8');
const marker = /const CARROT_ART = \{ tilt: -?[\d.]+, width: [\d.]+, height: [\d.]+ \} as const;/;
if (!marker.test(original)) throw new Error('Carrot art configuration was not found');

const variants = [
  { name: 'gentle-lean', tilt: -0.28, width: 0.82, height: 0.82 },
  { name: 'chunky-diagonal', tilt: -0.45, width: 0.95, height: 0.74 },
  { name: 'long-root', tilt: -0.55, width: 0.72, height: 0.96 },
  { name: 'reverse-lean', tilt: 0.4, width: 0.86, height: 0.82 },
];

try {
  for (const variant of variants) {
    const config = `const CARROT_ART = { tilt: ${variant.tilt}, width: ${variant.width}, height: ${variant.height} } as const;`;
    writeFileSync(source, original.replace(marker, config));
    await new Promise(resolve => setTimeout(resolve, 700)); // let Vite rebuild the renderer worker
    execFileSync(process.execPath, [capture, url, `docs/mockups/carrot-pickup/${variant.name}`], { stdio: 'inherit' });
  }
} finally {
  writeFileSync(source, original);
}
