/* global document, MutationObserver */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:4187/bunnybrawl/';
const runs = Number(process.argv[3] ?? 5);
const browser = await chromium.launch({ headless: true });

try {
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-testid="main-menu"]')) {
          performance.mark('main-menu-visible');
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('main-menu').waitFor();
    const menu = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      const scripts = resources.filter((entry) => entry.name.endsWith('.js'));
      return {
        menuMs: Math.round(performance.getEntriesByName('main-menu-visible')[0].startTime),
        jsTransferKiB: Math.round(scripts.reduce((sum, entry) => sum + entry.transferSize, 0) / 1024),
        jsDecodedKiB: Math.round(scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0) / 1024),
        scripts: scripts.map((entry) => new URL(entry.name).pathname.split('/').at(-1)),
      };
    });
    await page.evaluate(() => {
      const observer = new MutationObserver(() => {
        if (document.querySelector('.online-modal')) {
          performance.mark('online-modal-visible');
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
      performance.mark('online-click');
      document.querySelector('[data-testid="online-btn"]').click();
    });
    await page.locator('.online-modal').waitFor();
    const online = await page.evaluate(() => ({
      onlineOpenMs: Math.round(performance.getEntriesByName('online-modal-visible')[0].startTime
        - performance.getEntriesByName('online-click')[0].startTime),
      jsTransferAfterOnlineKiB: Math.round(performance.getEntriesByType('resource')
        .filter((entry) => entry.name.endsWith('.js'))
        .reduce((sum, entry) => sum + entry.transferSize, 0) / 1024),
    }));
    console.log(JSON.stringify({ run: i + 1, ...menu, ...online }));
    await context.close();
  }
} finally {
  await browser.close();
}
