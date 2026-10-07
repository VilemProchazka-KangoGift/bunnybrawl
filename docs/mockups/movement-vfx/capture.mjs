import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:4199/bunnybrawl/';
const output = fileURLToPath(new URL('./live/', import.meta.url));
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  for (const mode of ['default', 'main-sim']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(`${mode}: ${error.message}`));
    await page.goto(base + '?arena=meadow&bots=0&killLimit=100' + (mode === 'default' ? '' : '&simWorker=off'));
    await page.waitForFunction(() => {
      const s = window.__bunnyTest?.state();
      return s?.phase === 'playing' && s.countdown === 0;
    });
    // Initial spawn/mirror data can be older than the visible settled position.
    await page.waitForTimeout(1300);
    await page.waitForFunction(() => window.__bunnyTest.state().players.find(p => p.id === 'P1')?.state === 'idle');
    if (mode === 'main-sim') {
      // Seed an unobstructed ground contact for the art review, then drive the
      // real simulation with keyboard inputs. Deliberate cover is not altered.
      await page.evaluate(() => {
        const p = window.__bunnyTest.state().players.find(p => p.id === 'P1');
        p.x = 790; p.y = 660 - p.height; p.vx = 0; p.vy = 0;
        p.state = 'idle'; p.fastFalling = false;
      });
      await page.waitForTimeout(150);
    } else {
      await page.keyboard.down('a'); await page.waitForTimeout(250);
      await page.keyboard.up('a'); await page.waitForTimeout(1100);
      await page.waitForFunction(() => window.__bunnyTest.state().players.find(p => p.id === 'P1')?.state === 'idle');
    }
    const info = await page.evaluate(() => {
      const p = window.__bunnyTest.state().players.find(p => p.id === 'P1');
      return { x: p.x, y: p.y, height: p.height, name: p.character.name,
        worker: !!window.__engineWorkerProxy, isolated: crossOriginIsolated };
    });
    if (info.worker !== (mode === 'default')) throw new Error('Unexpected worker mode');
    const clip = { x: Math.max(0, info.x - 80), y: Math.max(0, info.y + info.height - 280), width: 250, height: 300 };
    const pause = () => page.evaluate(() => window.__bunnyTest.gameLoop().pause());
    const resume = () => page.evaluate(() => window.__bunnyTest.gameLoop().resume());
    const screenshot = name => page.screenshot({ path: output + name + '.png', clip });
    async function sequence(prefix) {
      await page.keyboard.down('w');
      await page.waitForTimeout(80);
      await pause(); await page.waitForTimeout(35);
      await screenshot(prefix + '-jump');
      await page.keyboard.up('w');
      await resume(); await page.waitForTimeout(100);
      await page.keyboard.down('s');
      await page.waitForTimeout(55);
      await pause(); await page.waitForTimeout(35);
      await screenshot(prefix + '-stomp');
      await resume();
      for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(45);
        await pause(); await page.waitForTimeout(25);
        await screenshot(prefix + '-landing-' + i);
        await resume();
      }
      await page.keyboard.up('s');
    }
    await sequence(mode);
    if (mode === 'main-sim') {
      await page.waitForFunction(() => window.__bunnyTest.state().players.find(p => p.id === 'P1')?.state === 'idle');
      await page.evaluate(() => { window.__bunnyTest.state().dayPhase = 0.5; });
      await page.waitForTimeout(100);
      await sequence('night');
    }
    console.log(mode, JSON.stringify(info));
    await page.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS: live movement captures in both worker modes; night on main simulation; no browser errors.');
} finally {
  await browser.close();
}
