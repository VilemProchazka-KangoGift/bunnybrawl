import { chromium } from 'playwright';

const [url, outputPrefix] = process.argv.slice(2);
if (!url || !outputPrefix) throw new Error('Usage: node capture.mjs <base-url> <output-prefix>');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(`${url}?arena=meadow&bots=0&simWorker=off`, { waitUntil: 'domcontentloaded' });
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
    state.springs = [
      { x: 380, y: 400, platformIndex: 3, bounceTimer: 0, life: 90, growTimer: 0 },
      { x: 640, y: 480, platformIndex: 5, bounceTimer: 0, life: 90, growTimer: 0 },
      { x: 650, y: 290, platformIndex: 6, bounceTimer: 0, life: 90, growTimer: 0 },
    ];
    state.dayPhase = 0;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputPrefix}-day.png` });
  await page.screenshot({ path: `${outputPrefix}-detail.png`, clip: { x: 585, y: 430, width: 110, height: 80 } });
  await page.evaluate(() => {
    const state = globalThis.__bunnyTest?.state();
    if (state) state.dayPhase = 0.5;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputPrefix}-night.png` });
  await page.evaluate(() => {
    const state = globalThis.__bunnyTest?.state();
    if (!state) return;
    state.dayPhase = 0;
    state.springs[1].bounceTimer = 0.09;
  });
  await page.waitForTimeout(30);
  await page.screenshot({ path: `${outputPrefix}-bounce-detail.png`, clip: { x: 585, y: 430, width: 110, height: 80 } });
} finally {
  await browser.close();
}
