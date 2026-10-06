/* global document, MutationObserver */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

// CI supplies build provenance; standalone timing comparisons remain unrestricted.
const arenaChunks = process.env.LOADING_BUDGET_REPORT
  ? JSON.parse(readFileSync(process.env.LOADING_BUDGET_REPORT, 'utf8')).arenaChunks : [];

const url = process.argv[2] ?? 'http://127.0.0.1:4187/bunnybrawl/';
const runs = Number(process.argv[3] ?? 5);
if (!Number.isInteger(runs) || runs < 1) throw new Error('Runs must be a positive integer');
const flow = process.argv[4] ?? 'online';
if (!['online', 'lobby'].includes(flow)) throw new Error('Flow must be online or lobby');
const network = process.argv[5] ?? 'local';
if (!['local', 'constrained'].includes(network)) throw new Error('Network must be local or constrained');
const menuDwellMs = Number(process.argv[6] ?? 0);
if (!Number.isFinite(menuDwellMs) || menuDwellMs < 0) throw new Error('Menu dwell must be nonnegative');
const buttonTestId = flow === 'lobby' ? 'play-button' : 'online-btn';
const targetSelector = flow === 'lobby' ? '[data-testid="char-select"]' : '.online-modal';
const browser = await chromium.launch({ headless: true });

try {
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const arenaRequests = [];
    cdp.on('Network.requestWillBeSent', event => {
      const pathname = new URL(event.request.url).pathname;
      if (arenaChunks.some(file => pathname.endsWith(`/${file}`))) {
        arenaRequests.push({ pathname, startedAt: event.wallTime * 1000 });
      }
    });
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
        menuEpochMs: performance.timeOrigin + menuAt,
        jsTransferKiB: Math.round(scripts.reduce((sum, entry) => sum + entry.transferSize, 0) / 1024),
        jsDecodedKiB: Math.round(scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0) / 1024),
        scripts: scripts.map((entry) => new URL(entry.name).pathname.split('/').at(-1)),
      };
    });
    // CDP records request start time, so an eager arena fetch is caught even
    // when its response finishes after the menu mounts.
    const earlyArenaRequests = arenaRequests.filter(request => request.startedAt < menu.menuEpochMs);
    if (earlyArenaRequests.length) {
      throw new Error(`Arena chunks requested before menu paint: ${earlyArenaRequests.map(request => request.pathname).join(', ')}`);
    }
    delete menu.menuEpochMs;
    if (menuDwellMs) await page.waitForTimeout(menuDwellMs);
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
    console.log(JSON.stringify({ run: i + 1, flow, network, menuDwellMs, ...menu, ...entry }));
    await context.close();
  }
} finally {
  await browser.close();
}
