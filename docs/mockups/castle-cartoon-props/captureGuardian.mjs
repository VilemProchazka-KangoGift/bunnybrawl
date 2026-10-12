import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const base = process.env.CASTLE_PROPS_URL ?? 'http://127.0.0.1:4271/bunnybrawl/';
const browser = await chromium.launch(process.env.CASTLE_PROPS_BROWSER
  ? { executablePath: process.env.CASTLE_PROPS_BROWSER }
  : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('docs/mockups/castle-props/render.html?variant=actionable-current', base).href);
  await page.locator('html[data-ready="true"]').waitFor({ timeout: 20000 });
  if (errors.length) throw new Error(errors.join(' | '));
  await page.locator('.scene').screenshot({ path: join(directory, 'guardian-live-scene.png') });
  await page.screenshot({ clip: { x: 420, y: 606, width: 450, height: 110 }, path: join(directory, 'guardian-live-detail.png') });
  console.log('Captured production rest and compressed Guardian at 1280 × 720.');
} finally {
  await browser.close();
}
