import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const output = join(directory, '..', '..', '..', '..', 'src', 'engine', 'arenas', 'assets');
const browser = await chromium.launch(process.env.CASTLE_PROPS_BROWSER ? { executablePath: process.env.CASTLE_PROPS_BROWSER } : {});
try {
  const page = await browser.newPage();
  for (const [pose, source] of [['rest', 'guardian-trace-10.svg'], ['compressed', 'guardian-compressed-trace-10.svg']]) {
    const svg = await readFile(join(directory, source), 'utf8');
    const result = await page.evaluate(async text => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 16) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (right < left) throw new Error('Empty Guardian pose');
      const cropped = document.createElement('canvas');
      cropped.width = right - left + 1; cropped.height = bottom - top + 1;
      cropped.getContext('2d').drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
      return { width: cropped.width, height: cropped.height, bytes: cropped.toDataURL('image/webp', .95).split(',')[1] };
    }, svg);
    const path = join(output, `castle-guardian-${pose}.webp`);
    await writeFile(path, Buffer.from(result.bytes, 'base64'));
    console.log(`${pose}: ${result.width}x${result.height} -> ${path}`);
  }
} finally { await browser.close(); }
