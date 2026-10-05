import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.CHARACTER_MOCKUP_URL ?? 'http://127.0.0.1:4193';
const browser = await chromium.launch({ headless: true });
try {
  for (const style of ['current', 'storybook', 'plush', 'cartoon']) {
    for (const time of ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 997 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const address = `${server}/bunnybrawl/docs/mockups/character-styles/render.html?style=${style}&time=${time}`;
      const response = await page.goto(address);
      if (!response?.ok()) throw new Error(`${address}: HTTP ${response?.status()}`);
      await page.locator('html[data-ready="true"]').waitFor();
      if (errors.length) throw new Error(`${style} ${time}: ${errors.join('; ')}`);
      await page.screenshot({ path: join(directory, `${style}-${time}.png`), fullPage: true });
      console.log(`${style}-${time}.png`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
