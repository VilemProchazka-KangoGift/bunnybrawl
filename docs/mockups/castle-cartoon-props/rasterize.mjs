import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const output = join(directory, '..', '..', '..', 'src', 'engine', 'arenas', 'assets');
const browser = await chromium.launch(process.env.CASTLE_PROPS_BROWSER ? { executablePath: process.env.CASTLE_PROPS_BROWSER } : {});
try {
  const page = await browser.newPage();
  for (const name of ['guard', 'sconce', 'chandelier', 'column']) {
    const svg = await readFile(join(directory, 'svg', `${name}.svg`), 'utf8');
    const data = await page.evaluate(async source => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 16) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      if (left > right) throw new Error('Empty prop');
      const cropped = document.createElement('canvas');
      cropped.width = right - left + 1; cropped.height = bottom - top + 1;
      cropped.getContext('2d').drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
      return { base64: cropped.toDataURL('image/webp', .95).split(',')[1], width: cropped.width, height: cropped.height };
    }, svg);
    const path = join(output, `castle-${name}-cartoon.webp`);
    await writeFile(path, Buffer.from(data.base64, 'base64'));
    console.log(`${name}: ${data.width}x${data.height} -> ${path}`);
  }
} finally { await browser.close(); }
