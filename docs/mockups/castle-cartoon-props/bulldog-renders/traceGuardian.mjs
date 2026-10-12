import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const modulePath = process.env.VTRACER_MODULE ?? '@visioncortex/vtracer';
const vtracer = require(modulePath);
const browser = await chromium.launch(process.env.CASTLE_PROPS_BROWSER ? { executablePath: process.env.CASTLE_PROPS_BROWSER } : {});
try {
  const page = await browser.newPage();
  for (const [pose, variants] of [['guardian', [[10, 1.5], [16, 1.1]]], ['guardian-compressed', [[10, 1.5]]]]) {
  const source = await readFile(join(directory, `${pose}.png`));
  const prepared = await page.evaluate(async dataUrl => {
    const image = new Image(); image.src = dataUrl; await image.decode();
    const input = document.createElement('canvas');
    input.width = image.naturalWidth; input.height = image.naturalHeight;
    const sourceCtx = input.getContext('2d', { willReadFrequently: true });
    sourceCtx.drawImage(image, 0, 0);
    const rgba = sourceCtx.getImageData(0, 0, input.width, input.height).data;
    let left = input.width, right = -1, top = input.height, bottom = -1;
    for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
      if (rgba[(y * input.width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) throw new Error('Guardian source has no visible pixels');
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 156;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const width = right - left + 1, height = bottom - top + 1;
    const scale = Math.min(196 / width, 152 / height);
    const dw = width * scale, dh = height * scale;
    ctx.drawImage(image, left, top, width, height, (200 - dw) / 2, 156 - dh - 2, dw, dh);
    return canvas.toDataURL('image/png').split(',')[1];
  }, `data:image/png;base64,${source.toString('base64')}`);
  const input = join(directory, `${pose}-prepared.png`);
  await writeFile(input, Buffer.from(prepared, 'base64'));
  for (const [colors, simplify] of variants) {
    const output = join(directory, `${pose}-trace-${colors}.svg`);
    vtracer.convertFileSync(input, output, {
      preset: 'poster', mode: 'spline', maxColors: colors,
      filterSpeckle: 5, simplify,
    });
    const svg = await readFile(output, 'utf8');
    if (!svg.includes('<path') || svg.includes('<image')) throw new Error(`Invalid trace: ${colors}`);
    console.log(`${pose}, ${colors} colors: ${(svg.match(/<path\b/g) ?? []).length} paths, ${(await stat(output)).size} bytes`);
  }
  }
} finally { await browser.close(); }
