import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2];
if (!baseUrl) throw new Error('Usage: node capture.mjs <running-vite-base-url>');
const browser = await chromium.launch({ headless: true });
try {
  for (const animal of ['Bear', 'Owl', 'Cat']) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`${baseUrl}docs/mockups/character-roster-batch-2/render.html?animal=${animal}`);
    if (!response?.ok()) throw new Error(`${animal}: HTTP ${response?.status()}`);
    await page.locator('html[data-ready="true"]').waitFor();
    if (errors.length) throw new Error(`${animal}: ${errors.join('; ')}`);
    await page.screenshot({ path: join(directory, `${animal.toLowerCase()}-comparison.png`) });
    await page.close();
  }
  for (const time of ['day', 'night']) {
    for (const style of ['roster-batch-2-original', 'roster-batch-2']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 997 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`${baseUrl}docs/mockups/character-styles/render.html?style=${style}&time=${time}`);
    if (!response?.ok()) throw new Error(`Scene ${time}: HTTP ${response?.status()}`);
    await page.locator('html[data-ready="true"]').waitFor();
    if (errors.length) throw new Error(`Scene ${time}: ${errors.join('; ')}`);
    await page.screenshot({ path: join(directory, `meadow-${style === 'roster-batch-2' ? 'preview' : 'original'}-${time}.png`), fullPage: true });
    await page.close();
    }
  }
} finally {
  await browser.close();
}
