import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const base = process.env.CASTLE_PROPS_URL ?? 'http://127.0.0.1:4285/bunnybrawl/';
const browser = await chromium.launch(process.env.CASTLE_PROPS_BROWSER
  ? { executablePath: process.env.CASTLE_PROPS_BROWSER }
  : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('?arena=castle&bots=0&simWorker=off', base).href);
  await page.getByTestId('game-canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(4200);
  // Put P1 at the former overlap point in the main-thread simulation. The
  // renderer still runs in its worker, exercising the real player draw order.
  await page.evaluate(() => {
    const player = window.__bunnyTest?.gameLoop()?.getState().players.find(item => item.id === 'P1');
    if (!player) throw new Error('P1 state unavailable');
    player.x = 325;
    player.y = 248;
    player.vx = 0;
    player.vy = 0;
  });
  await page.waitForTimeout(200);
  if (errors.length) throw new Error(errors.join(' | '));
  await page.screenshot({ path: join(directory, 'armor-crossing.png') });
  console.log('Captured Bunny at the former gallery armor overlap point.');
} finally {
  await browser.close();
}
