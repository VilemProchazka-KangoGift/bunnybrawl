/* global document, MutationObserver */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:4187/bunnybrawl/';
const runs = Number(process.argv[3] ?? 5);
if (!Number.isInteger(runs) || runs < 1) throw new Error('Runs must be a positive integer');
const flow = process.argv[4] ?? 'online';
if (!['online', 'lobby'].includes(flow)) throw new Error('Flow must be online or lobby');
const network = process.argv[5] ?? 'local';
if (!['local', 'constrained'].includes(network)) throw new Error('Network must be local or constrained');
const buttonTestId = flow === 'lobby' ? 'play-button' : 'online-btn';
const targetSelector = flow === 'lobby' ? '[data-testid="char-select"]' : '.online-modal';
const browser = await chromium.launch({ headless: true });

try {
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (network === 'constrained') {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 100, downloadThroughput: 200_000, uploadThroughput: 100_000,
      });
    }
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
      const menuAt = performance.getEntriesByName('main-menu-visible')[0].startTime;
      const resources = performance.getEntriesByType('resource');
      const scripts = resources.filter((entry) => entry.name.endsWith('.js') && entry.responseEnd <= menuAt);
      return {
        menuMs: Math.round(menuAt),
        jsTransferKiB: Math.round(scripts.reduce((sum, entry) => sum + entry.transferSize, 0) / 1024),
        jsDecodedKiB: Math.round(scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0) / 1024),
        scripts: scripts.map((entry) => new URL(entry.name).pathname.split('/').at(-1)),
      };
    });
    await page.evaluate(({ buttonTestId, targetSelector }) => {
      const observer = new MutationObserver(() => {
        if (document.querySelector(targetSelector)) {
          performance.mark('flow-visible');
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
      performance.mark('flow-click');
      document.querySelector(`[data-testid="${buttonTestId}"]`).click();
    }, { buttonTestId, targetSelector });
    await page.locator(targetSelector).waitFor();
    const entry = await page.evaluate(() => {
      const flowAt = performance.getEntriesByName('flow-visible')[0].startTime;
      return {
        flowOpenMs: Math.round(flowAt - performance.getEntriesByName('flow-click')[0].startTime),
        jsTransferAfterFlowKiB: Math.round(performance.getEntriesByType('resource')
          .filter((entry) => entry.name.endsWith('.js') && entry.responseEnd <= flowAt)
          .reduce((sum, entry) => sum + entry.transferSize, 0) / 1024),
      };
    });
    console.log(JSON.stringify({ run: i + 1, flow, network, ...menu, ...entry }));
    await context.close();
  }
} finally {
  await browser.close();
}
