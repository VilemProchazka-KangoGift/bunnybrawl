/* global createImageBitmap, document */
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const sources = await Promise.all([
  readFile(join(base, 'v3/pocket-bunny-poses.png')),
  readFile(join(base, 'v4/idle-sit-source.png')),
  readFile(join(base, 'v4/fast-stomp-source.png')),
  readFile(join(base, 'v4/sit-impact-source.png')),
  readFile(join(base, 'v5/angry-fast-stomp-chubby-source.png')),
]);
// Bounding boxes are measured from the source alpha and retain each complete silhouette.
// Indices are shared with resolvePose in src/engine/characters/prototypes/pocketBunnyRig.ts.
const poses = [
  [0, 34, 56, 337, 643, 27, 42],   // idle
  [0, 451, 56, 362, 643, 29, 42],  // walk A
  [0, 878, 65, 316, 631, 27, 41],  // walk passing
  [0, 1295, 67, 348, 633, 29, 42], // walk B
  [0, 1668, 32, 418, 610, 32, 40], // jump
  [1, 34, 21, 393, 699, 28, 42],   // attentive idle
  [1, 548, 23, 400, 696, 28, 42],  // blink
  [1, 1101, 94, 423, 627, 30, 33], // seated
  [4, 44, 95, 974, 1290, 32, 43],// angry fast stomp at roster-matched scale
  [3, 997, 21, 627, 834, 32, 33],  // stomp impact
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ images, frames }) => {
    const SCALE = 4;
    const CELL_W = 152;
    const CELL_H = 188;
    const EDGE_RADIUS = 0.28 * SCALE;
    const decoded = await Promise.all(images.map(async (base64) => {
      const response = await fetch(`data:image/png;base64,${base64}`);
      return createImageBitmap(await response.blob());
    }));
    const canvas = document.createElement('canvas');
    canvas.width = CELL_W * 4;
    canvas.height = CELL_H * 3;
    const output = canvas.getContext('2d');
    for (let i = 0; i < frames.length; i++) {
      const [source, sx, sy, sw, sh, drawW, drawH] = frames[i];
      const x = (CELL_W - drawW * SCALE) / 2;
      const y = CELL_H - 2 * SCALE - drawH * SCALE;
      const art = document.createElement('canvas');
      art.width = CELL_W; art.height = CELL_H;
      const artCtx = art.getContext('2d');
      artCtx.imageSmoothingQuality = 'high';
      artCtx.drawImage(decoded[source], sx, sy, sw, sh, x, y, drawW * SCALE, drawH * SCALE);

      const silhouette = document.createElement('canvas');
      silhouette.width = CELL_W; silhouette.height = CELL_H;
      const mask = silhouette.getContext('2d');
      mask.drawImage(art, 0, 0);
      mask.globalCompositeOperation = 'source-in';
      mask.fillStyle = '#261a16';
      mask.fillRect(0, 0, CELL_W, CELL_H);

      const px = (i % 4) * CELL_W;
      const py = Math.floor(i / 4) * CELL_H;
      for (let angleIndex = 0; angleIndex < 8; angleIndex++) {
        const angle = angleIndex * Math.PI / 4;
        output.drawImage(silhouette, px + Math.cos(angle) * EDGE_RADIUS, py + Math.sin(angle) * EDGE_RADIUS);
      }
      output.drawImage(art, px, py);
    }
    decoded.forEach(image => image.close());
    return canvas.toDataURL('image/png').split(',')[1];
  }, { images: sources.map(image => image.toString('base64')), frames: poses });
  const target = join(base, 'v4/pocket-bunny-game-atlas.png');
  await writeFile(target, Buffer.from(result, 'base64'));
  console.log(`Saved ${target}`);
} finally {
  await browser.close();
}
