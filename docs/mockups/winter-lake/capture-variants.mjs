import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.WINTER_LAKE_URL ?? 'http://127.0.0.1:4222/bunnybrawl/';
const browser = await chromium.launch({ headless: true });

const allVariants = [
    'current', 'quiet-shore', 'glacial-basin', 'violet-inlet',
    'mirror-ice', 'fir-shore', 'rose-dawn', 'polar-gap',
    'polar-open', 'polar-stepped', 'polar-offset', 'polar-alpenglow',
  ];
const selectedVariants = process.argv.slice(2);
try {
  for (const variant of selectedVariants.length ? selectedVariants : allVariants) {
    for (const time of ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const url = new URL(`docs/mockups/winter-lake/render.html?variant=${variant}&time=${time}`, server);
      const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) throw new Error(`${variant} ${time}: HTTP ${response?.status()}`);
      await page.locator('html[data-ready="true"]').waitFor({ timeout: 30000 });
      if (errors.length) throw new Error(`${variant} ${time}: ${errors.join('; ')}`);
      await page.locator('.scene').screenshot({ path: join(directory, `${variant}-${time}.png`) });
      console.log(`${variant}-${time}.png`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
