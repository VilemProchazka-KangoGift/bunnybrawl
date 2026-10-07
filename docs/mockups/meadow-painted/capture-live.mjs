import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const directory = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });
try {
  for (const [mode, query] of [['default', ''], ['renderer-worker', '&simWorker=off']]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:4224/bunnybrawl/?arena=meadow&bots=1${query}`);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
    await page.waitForTimeout(4000);
    if (errors.length) throw new Error(`${mode}: ${errors.join('; ')}`);
    await page.screenshot({ path: join(directory, `live-${mode}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
}
