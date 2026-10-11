import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:49061/bunnybrawl/docs/mockups/geyser-jets/index.html');
await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready'));
await page.locator('#play').click();
await page.locator('#time').fill('2.2');
await page.locator('#time').dispatchEvent('input');
fs.mkdirSync('docs/mockups/geyser-jets/captures', { recursive: true });
await page.screenshot({ path: 'docs/mockups/geyser-jets/captures/comparison.png', fullPage: true });
for (const state of ['active', 'dormant']) {
  await page.selectOption('#state', state);
  for (let i = 0; i < 12; i++) {
    await page.selectOption('#view', String(i));
    if (await page.locator('section:visible').count() !== 1) throw new Error('Focus view failed');
    await page.screenshot({ path: `docs/mockups/geyser-jets/captures/${state}-${i}.png` });
  }
}
await page.selectOption('#view', 'all');
await page.setViewportSize({ width: 360, height: 800 });
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile overflow');
await page.screenshot({ path: 'docs/mockups/geyser-jets/captures/mobile.png', fullPage: true });
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log('PASS: twelve variants, active/dormant, focus views, timeline and mobile layout; no browser errors');
