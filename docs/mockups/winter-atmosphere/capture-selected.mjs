import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.WINTER_ATMOSPHERE_URL ?? 'http://127.0.0.1:4244/bunnybrawl/';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WINTER_ATMOSPHERE_CHROMIUM
    ? { executablePath: process.env.WINTER_ATMOSPHERE_CHROMIUM } : {}),
});

try {
  for (const time of ['day', 'night']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = new URL(`docs/mockups/winter-lake/render.html?variant=current&props=current&action=ink-bell&atmosphere=current&time=${time}`, server);
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    if (!response?.ok()) throw new Error(`${time}: HTTP ${response?.status()}`);
    await page.locator('html[data-ready="true"]').waitFor({ timeout: 30000 });
    if (errors.length) throw new Error(`${time}: ${errors.join('; ')}`);
    const filename = `selected-teal-${time}.png`;
    await page.locator('.scene').screenshot({ path: join(directory, filename) });
    console.log(filename);
    await page.close();
  }
} finally {
  await browser.close();
}
