import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.WINTER_PROPS_URL ?? 'http://127.0.0.1:4235/bunnybrawl/';
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, params] of [
    ['canvas-round-day', 'time=day'],
    ['canvas-round-night', 'time=night'],
    ['canvas-round-cover', 'time=day&cover=1'],
    ['igloo-blue-brick', 'time=day&igloo=blue-brick'],
    ['igloo-snow-stone', 'time=day&igloo=snow-stone'],
    ['igloo-arched-door', 'time=day&igloo=arched-door'],
    ['igloo-blue-brick-night', 'time=night&igloo=blue-brick'],
    ['igloo-snow-stone-night', 'time=night&igloo=snow-stone'],
    ['igloo-arched-door-night', 'time=night&igloo=arched-door'],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = new URL(`docs/mockups/winter-lake/render.html?variant=current&props=current&${params}`, server);
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    if (!response?.ok()) throw new Error(`${name}: HTTP ${response?.status()}`);
    await page.locator('html[data-ready="true"]').waitFor({ timeout: 30000 });
    if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
    await page.locator('.scene').screenshot({ path: join(directory, `${name}.png`) });
    await page.close();
    console.log(`${name}.png`);
  }
} finally { await browser.close(); }
