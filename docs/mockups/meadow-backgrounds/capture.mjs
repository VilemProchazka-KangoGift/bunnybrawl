import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.MEADOW_MOCKUP_URL ?? 'http://127.0.0.1:4192';
const browser = await chromium.launch({ headless: true });
try {
  for (const variant of ['current', 'wooded-valley', 'countryside', 'storybook-clouds', 'valley-and-clouds', 'raised-hills', 'tall-hills', 'production']) {
    for (const time of variant === 'production' ? ['day', 'sunset', 'night'] : ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const address = `${server}/bunnybrawl/docs/mockups/meadow-backgrounds/render.html?variant=${variant}&time=${time}`;
      const response = await page.goto(address);
      if (!response?.ok()) throw new Error(`${address}: HTTP ${response?.status()}`);
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      if (errors.length) throw new Error(`${variant} ${time}: ${errors.join('; ')}`);
      await page.locator('.scene').screenshot({ path: join(directory, `${variant}-${time}.png`) });
      console.log(`${variant}-${time}.png`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
