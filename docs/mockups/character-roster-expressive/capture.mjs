import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2];
if (!baseUrl) throw new Error('Usage: node capture.mjs <running-vite-base-url>');
const browser = await chromium.launch({ headless: true });
try {
  for (const group of ['A', 'B', 'C', 'D']) {
    for (const time of ['day', 'night']) {
      for (const version of ['prior', 'preview']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 997 }, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const response = await page.goto(`${baseUrl}docs/mockups/character-styles/render.html?style=roster-expressive-${version}&group=${group}&time=${time}`);
        if (!response?.ok()) throw new Error(`${group} ${time} ${version}: HTTP ${response?.status()}`);
        await page.locator('html[data-ready="true"]').waitFor();
        if (errors.length) throw new Error(`${group} ${time} ${version}: ${errors.join('; ')}`);
        await page.screenshot({ path: join(directory, `meadow-${group.toLowerCase()}-${version}-${time}.png`), fullPage: true });
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
