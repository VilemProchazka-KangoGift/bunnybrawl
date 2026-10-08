// Technical crop, resize, and WebP encoding of the approved painted studies.
// The source PNGs remain here so art direction can be revisited losslessly.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const target = resolve(directory,'../../../src/engine/arenas/assets');
const server = process.env.WINTER_PROPS_URL ?? 'http://127.0.0.1:4236/bunnybrawl/';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(new URL('docs/mockups/winter-lake/render.html?variant=current',server).href);
  const specs = [
    ['snow-bush-paint-study.png','winter-bush-leafy.webp',55,190,980,455,420,195],
    ['snow-bush-paint-study.png','winter-bush-hedge.webp',1120,198,910,450,420,195],
    ['igloo-paint-study.png','winter-igloo.webp',0,0,1768,833,480,226],
  ];
  for (const [source,name,sx,sy,sw,sh,width,height] of specs) {
    const encoded = await page.evaluate(async ({url,sx,sy,sw,sh,width,height}) => {
      const image = new Image();
      image.src=url;
      await image.decode();
      const canvas=document.createElement('canvas');
      canvas.width=width; canvas.height=height;
      const ctx=canvas.getContext('2d');
      if(!ctx) throw new Error('Missing canvas context');
      ctx.drawImage(image,sx,sy,sw,sh,0,0,width,height);
      return canvas.toDataURL('image/webp',.88).split(',')[1];
    },{url:new URL(`docs/mockups/winter-props/${source}`,server).href,sx,sy,sw,sh,width,height});
    const bytes=Buffer.from(encoded,'base64');
    await writeFile(resolve(target,name),bytes);
    console.log(`${name}: ${bytes.length} bytes`);
  }
  await page.close();
} finally { await browser.close(); }
