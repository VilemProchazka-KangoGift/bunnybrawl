import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.WINTER_ACTION_URL ?? 'http://127.0.0.1:4242/bunnybrawl/';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WINTER_ACTION_CHROMIUM ? { executablePath: process.env.WINTER_ACTION_CHROMIUM } : {}),
});
try {
  for (const [mode, query] of [['default', ''], ['sim-worker-off', '&simWorker=off']]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${server}?arena=winter_lake&bots=4${query}`);
    await page.waitForFunction(() => globalThis.__bunnyTest?.state()?.phase === 'playing');
    await page.waitForTimeout(3000);
    if (errors.length) throw new Error(`${mode}: ${errors.join('; ')}`);
    await page.screenshot({ path: join(directory, `live-ink-bell-${mode}.png`) });
    if (mode === 'sim-worker-off') {
      await page.waitForFunction(() => {
        const state = globalThis.__bunnyTest?.state();
        return state && state.springs.length > 0 && state.thorns.length > 0;
      }, undefined, { timeout: 35000 });
      if (errors.length) throw new Error(`${mode} objects: ${errors.join('; ')}`);
      await page.screenshot({ path: join(directory, 'live-ink-bell-objects.png') });
      console.log('live-ink-bell-objects.png');
    }
    await page.close();
    console.log(`live-ink-bell-${mode}.png`);
  }
} finally {
  await browser.close();
}
