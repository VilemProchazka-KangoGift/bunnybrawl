import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const assets = join(directory, '..', '..', '..', '..', 'src', 'engine', 'arenas', 'assets');
const inputs = [
  'castle-painted',
  'castle-guard-cartoon', 'castle-sconce-cartoon', 'castle-chandelier-cartoon', 'castle-column-cartoon',
  'castle-guardian-rest', 'castle-guardian-compressed',
];
const browser = await chromium.launch(process.env.CASTLE_PROPS_BROWSER
  ? { executablePath: process.env.CASTLE_PROPS_BROWSER }
  : {});
try {
  const page = await browser.newPage();
  for (const name of inputs) {
    const source = await readFile(join(assets, `${name}.webp`));
    const result = await page.evaluate(async ({ base64, backdrop }) => {
      const image = new Image();
      image.src = `data:image/webp;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: backdrop });
      if (backdrop) {
        ctx.drawImage(image, 0, 0);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < frame.data.length; i += 4) {
          frame.data[i] = frame.data[i] * .945 + 9;
          frame.data[i + 1] = frame.data[i + 1] * .967 + 11;
          frame.data[i + 2] = frame.data[i + 2] * .962 + 13;
        }
        ctx.putImageData(frame, 0, 0);
        const sx = canvas.width / 1280, sy = canvas.height / 720;
        const pool = (x, y, radius, inner) => {
          ctx.save();
          ctx.scale(sx, sy);
          ctx.globalCompositeOperation = 'screen';
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          gradient.addColorStop(0, inner);
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
          ctx.restore();
        };
        pool(638, 174, 330, 'rgba(173,202,224,.09)');
        pool(630, 590, 290, 'rgba(135,170,199,.055)');
      } else {
        ctx.filter = 'saturate(.45) brightness(1.12) contrast(1.03)';
        ctx.drawImage(image, 0, 0);
      }
      return {
        width: canvas.width,
        height: canvas.height,
        base64: canvas.toDataURL('image/webp', .95).split(',')[1],
      };
    }, { base64: source.toString('base64'), backdrop: name === 'castle-painted' });
    const destination = join(assets, `${name}-balanced-silver.webp`);
    await writeFile(destination, Buffer.from(result.base64, 'base64'));
    console.log(`${name}: ${result.width}x${result.height} -> ${destination}`);
  }
} finally {
  await browser.close();
}
