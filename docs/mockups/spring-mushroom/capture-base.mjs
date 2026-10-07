import { chromium } from 'playwright';

const baseUrl = process.argv[2];
if (!baseUrl) throw new Error('Usage: node capture-base.mjs <production-preview-url>');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}?arena=meadow&bots=0&simWorker=off`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__bunnyTest?.state()?.countdown === 0, null, { timeout: 20000 });
  await page.evaluate(() => {
    const state = globalThis.__bunnyTest?.state();
    if (!state) throw new Error('Match state unavailable');
    state.players[0].x = 75;
    state.players[0].y = 620;
    state.players[0].vx = 0;
    state.players[0].vy = 0;
    for (const bot of state.players.slice(1)) bot.active = false;
    state.carrots = [];
    state.thorns = [];
    state.springs = [];
    state.dayPhase = 0;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'docs/mockups/spring-mushroom/base-day.png' });
  await page.evaluate(() => {
    const state = globalThis.__bunnyTest?.state();
    if (state) state.dayPhase = 0.5;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'docs/mockups/spring-mushroom/base-night.png' });
} finally {
  await browser.close();
}
