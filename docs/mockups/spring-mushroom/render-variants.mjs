import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const directory = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2];
if (!url) throw new Error('Usage: node render-variants.mjs <served-variants-html-url>');
const ids = ['gold-bell', 'blue-inkcap', 'scarlet-fan', 'violet-cup', 'amber-dome', 'turquoise-shelf'];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.waitForFunction(() => globalThis.galleryReady === true);
  await page.screenshot({ path: join(directory, 'gallery.png'), fullPage: true });
  for (const id of ids) {
    for (const phase of ['day', 'night']) {
      const dataUrl = await page.evaluate(([name, light]) => globalThis.renderVariant(name, light), [id, phase]);
      await writeFile(join(directory, `${id}-${phase}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    }
  }
} finally {
  await browser.close();
}
