import { chromium } from 'playwright';

const [url, outputPrefix, arena = 'meadow'] = process.argv.slice(2);
if (!url || !outputPrefix) {
  throw new Error('Usage: node capture.mjs <base-url> <output-prefix> [arena]');
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(`${url}?arena=${encodeURIComponent(arena)}&bots=0&simWorker=off`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__bunnyTest?.state()?.countdown === 0, null, { timeout: 20000 });
  await page.evaluate(() => {
    const state = window.__bunnyTest?.state();
    if (!state) throw new Error('Match state unavailable');
    state.players[0].x = 75;
    state.players[0].y = 620;
    state.players[0].vx = 0;
    state.players[0].vy = 0;
    for (const bot of state.players.slice(1)) bot.active = false;
    state.carrots = [
      { x: 380, y: 350, active: true, spawnTime: -100 },
      { x: 640, y: 430, active: true, spawnTime: -100 },
      { x: 720, y: 620, active: true, spawnTime: -100 },
    ];
    state.dayPhase = 0;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputPrefix}-day.png` });
  await page.evaluate(() => {
    const state = window.__bunnyTest?.state();
    if (state) state.dayPhase = 0.5;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outputPrefix}-night.png` });
} finally {
  await browser.close();
}
