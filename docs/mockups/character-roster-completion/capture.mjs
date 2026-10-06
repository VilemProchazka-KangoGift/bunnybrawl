import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2];
if (!baseUrl) throw new Error('Usage: node capture.mjs <running-vite-base-url>');
const animals = [
  'Wolf', 'Panda', 'Pig', 'Cow', 'Goat', 'Horse', 'Sheep',
  'Monkey', 'Tiger', 'Rhino', 'Hedgehog', 'Chick', 'Axolotl',
];
const browser = await chromium.launch({ headless: true });
try {
  for (const animal of animals) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`${baseUrl}docs/mockups/character-roster-completion/render.html?animal=${animal}`);
    if (!response?.ok()) throw new Error(`${animal}: HTTP ${response?.status()}`);
    await page.locator('html[data-ready="true"]').waitFor();
    if (errors.length) throw new Error(`${animal}: ${errors.join('; ')}`);
    await page.screenshot({ path: join(directory, `${animal.toLowerCase()}-comparison.png`) });
    await page.close();
  }
  for (const group of ['A', 'B', 'C']) {
    for (const time of ['day', 'night']) {
      for (const version of ['original', 'preview']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 997 }, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const response = await page.goto(`${baseUrl}docs/mockups/character-styles/render.html?style=roster-completion-${version}&group=${group}&time=${time}`);
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
