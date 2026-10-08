import { chromium } from 'playwright';

const server = process.env.WINTER_PROPS_URL ?? 'http://127.0.0.1:4235/bunnybrawl/';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(new URL('docs/mockups/winter-lake/render.html?variant=current&props=current', server).href);
  await page.locator('html[data-ready="true"]').waitFor({ timeout: 30000 });
  const result = await page.evaluate(async () => {
    const [{ winterLake }, { toArena }, { drawRoundGroveForeground, drawRoundGroveBackground }] = await Promise.all([
      import('/bunnybrawl/src/engine/arenas/packs/winterLake.ts'),
      import('/bunnybrawl/src/engine/arenas/registry.ts'),
      import('/bunnybrawl/src/engine/arenas/packs/winterLakeRoundGroveProps.ts'),
    ]);
    const arena = toArena(winterLake);
    const canvas = new OffscreenCanvas(1280, 720);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');
    const t0 = performance.now();
    drawRoundGroveBackground(ctx, arena);
    const t1 = performance.now();
    drawRoundGroveForeground(ctx, arena);
    const t2 = performance.now();
    for (let i = 0; i < 500; i++) drawRoundGroveForeground(ctx, arena);
    const t3 = performance.now();
    return { staticBackgroundMs: t1 - t0, foregroundCacheBuildMs: t2 - t1, cachedForegroundDrawMs: (t3 - t2) / 500 };
  });
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
