/* global window, requestAnimationFrame */
import { chromium } from 'playwright';

const origin = process.env.CHARACTER_BENCH_URL ?? 'http://127.0.0.1:4195';
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (const worker of ['default', 'simWorker=off']) {
    for (const style of ['original', 'pocket']) {
      for (let trial = 0; trial < 3; trial++) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const params = new URLSearchParams({ arena: 'meadow', bots: '1' });
        if (style === 'pocket') params.set('pocketBunny', '1');
        if (worker !== 'default') params.set('simWorker', 'off');
        await page.goto(`${origin}/bunnybrawl/?${params}`);
        await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing', null, { timeout: 30000 });
        const result = await page.evaluate(async () => {
          const startMs = performance.now();
          const samples = [];
          await new Promise(resolve => {
            let last = 0;
            const tick = time => {
              if (last) samples.push(time - last);
              last = time;
              if (performance.now() - startMs < 2000) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
          samples.sort((a, b) => a - b);
          const atlas = performance.getEntriesByType('resource').find(item => item.name.includes('pocket-bunny-game-atlas'));
          return {
            toPlayingMs: Math.round(startMs),
            frameMedianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(2)),
            frameP95Ms: Number(samples[Math.floor(samples.length * .95)].toFixed(2)),
            atlasBytes: atlas?.encodedBodySize ?? 0,
          };
        });
        rows.push({ worker, style, trial: trial + 1, ...result, errors });
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(rows, null, 2));
