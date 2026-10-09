import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.WINTER_ACTION_URL ?? 'http://127.0.0.1:4240/bunnybrawl/';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WINTER_ACTION_CHROMIUM ? { executablePath: process.env.WINTER_ACTION_CHROMIUM } : {}),
});
try {
  for (const action of ['current', 'ink-bell', 'crystal-bloom', 'carved-puck']) {
    for (const time of ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const url = new URL(`docs/mockups/winter-lake/render.html?variant=current&props=current&action=${action}&time=${time}`, server);
      const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) throw new Error(`${action} ${time}: HTTP ${response?.status()}`);
      await page.locator('html[data-ready="true"]').waitFor({ timeout: 30000 });
      if (errors.length) throw new Error(`${action} ${time}: ${errors.join('; ')}`);
      await page.locator('.scene').screenshot({ path: join(directory, `${action}-${time}.png`) });
      await page.screenshot({ path: join(directory, `${action}-${time}-objects.png`),
        clip: { x: 260, y: 348, width: 760, height: 186 } });
      await page.close();
      console.log(`${action}-${time}.png`);
    }
  }
} finally {
  await browser.close();
}
