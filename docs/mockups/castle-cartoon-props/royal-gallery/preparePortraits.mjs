import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const assets = join(directory, '..', '..', '..', '..', 'src', 'engine', 'arenas', 'assets');
const browser = await chromium.launch(process.env.CASTLE_PROPS_BROWSER
  ? { executablePath: process.env.CASTLE_PROPS_BROWSER }
  : {});

try {
  const page = await browser.newPage();
  for (const name of ['duchess', 'king']) {
    const source = await readFile(join(directory, `${name}-cartoon-source.png`));
    const output = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const scan = document.createElement('canvas');
      scan.width = image.naturalWidth;
      scan.height = image.naturalHeight;
      const scanCtx = scan.getContext('2d', { willReadFrequently: true });
      scanCtx.drawImage(image, 0, 0);
      const { data } = scanCtx.getImageData(0, 0, scan.width, scan.height);
      let left = scan.width, top = scan.height, right = -1, bottom = -1;
      for (let y = 0; y < scan.height; y++) {
        for (let x = 0; x < scan.width; x++) {
          if (data[(y * scan.width + x) * 4 + 3] < 12) continue;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      if (right < left) throw new Error('portrait source has no visible pixels');
      const pad = 5;
      left = Math.max(0, left - pad); top = Math.max(0, top - pad);
      right = Math.min(scan.width - 1, right + pad);
      bottom = Math.min(scan.height - 1, bottom + pad);
      const width = right - left + 1, height = bottom - top + 1;
      const canvas = document.createElement('canvas');
      canvas.height = 276;
      canvas.width = Math.round(width / height * canvas.height);
      const ctx = canvas.getContext('2d');
      ctx.filter = 'saturate(.72) brightness(.9) contrast(1.04)';
      ctx.drawImage(image, left, top, width, height, 0, 0, canvas.width, canvas.height);
      return { width: canvas.width, height: canvas.height,
        base64: canvas.toDataURL('image/webp', .88).split(',')[1] };
    }, source.toString('base64'));
    const destination = join(assets, `castle-portrait-${name}.webp`);
    const bytes = Buffer.from(output.base64, 'base64');
    await writeFile(destination, bytes);
    console.log(`${name}: ${output.width}x${output.height}, ${bytes.length} bytes`);
  }
} finally {
  await browser.close();
}
