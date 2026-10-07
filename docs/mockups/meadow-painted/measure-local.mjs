import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const variant of ['production', 'painted-low-valley', 'painted-low-valley-small']) {
    const samples = [];
    const resourceMs = [];
    const plateMs = [];
    const backgroundMs = [];
    for (let i = 0; i < 12; i++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(`http://127.0.0.1:4223/bunnybrawl/docs/mockups/meadow-backgrounds/render.html?variant=${variant}&time=day`);
      await page.locator('html[data-ready="true"]').waitFor();
      const timing = await page.evaluate(() => ({
        ready: performance.now(),
        plate: performance.getEntriesByType('resource').find(e => e.name.includes('low-valley-') && e.name.includes('.webp'))?.duration ?? null,
        plateLoad: Number(globalThis.document.documentElement.dataset.plateLoadMs),
        background: Number(globalThis.document.documentElement.dataset.backgroundMs),
      }));
      samples.push(timing.ready);
      if (timing.plate != null) resourceMs.push(timing.plate);
      plateMs.push(timing.plateLoad);
      backgroundMs.push(timing.background);
      await page.close();
    }
    samples.sort((a, b) => a - b);
    resourceMs.sort((a, b) => a - b);
    plateMs.sort((a, b) => a - b);
    backgroundMs.sort((a, b) => a - b);
    console.log(variant, JSON.stringify({
      medianReadyMs: Math.round((samples[5] + samples[6]) / 2),
      rangeReadyMs: [Math.round(samples[0]), Math.round(samples.at(-1))],
      medianPlateResourceMs: resourceMs.length ? Math.round((resourceMs[5] + resourceMs[6]) / 2) : null,
      medianLoadAndDecodeMs: (plateMs[5] + plateMs[6]) / 2,
      medianBackgroundRenderMs: (backgroundMs[5] + backgroundMs[6]) / 2,
    }));
  }
} finally {
  await browser.close();
}
