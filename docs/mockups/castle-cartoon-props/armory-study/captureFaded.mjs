import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const base = process.env.CASTLE_PROPS_URL ?? 'http://127.0.0.1:4284/bunnybrawl/';
const browser = await chromium.launch(process.env.CASTLE_PROPS_BROWSER
  ? { executablePath: process.env.CASTLE_PROPS_BROWSER }
  : {});
try {
  for (const [label, query] of [['default', ''], ['simWorker-off', '&simWorker=off']]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL(`?arena=castle&bots=1${query}`, base).href);
    await page.getByTestId('game-canvas').waitFor({ timeout: 30000 });
    await page.waitForTimeout(4200);
    if (errors.length) throw new Error(`${label}: ${errors.join(' | ')}`);
    await page.screenshot({ path: join(directory, `faded-live-${label}.png`) });
    await page.close();
    console.log(`Captured faded Castle scene: ${label}`);
  }
} finally {
  await browser.close();
}
