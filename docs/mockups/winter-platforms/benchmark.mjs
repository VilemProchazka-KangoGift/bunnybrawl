import { chromium } from 'playwright';

const server = process.env.WINTER_PLATFORM_URL ?? 'http://127.0.0.1:4232/bunnybrawl/';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(new URL('docs/mockups/winter-platforms/sizing.html?renderer=vector', server).href);
  const result = await page.evaluate(async () => {
    const vector = await import('/bunnybrawl/src/engine/arenas/packs/winterLakeVectorPlatforms.ts');
    const painted = await import('/bunnybrawl/src/engine/arenas/packs/winterLakePaintedPlatforms.ts');
    const assets = await import('/bunnybrawl/src/engine/arenas/illustratedBackdropAsset.ts');
    await assets.preloadWinterPlatformArt();
    const images = assets.getWinterPlatformArt();
    const platforms = [
      { x: 0, y: 660, width: 1280, height: 60, ground: true },
      { x: 440, y: 350, width: 400, height: 24, style: 'snowBridge' },
      { x: 520, y: 490, width: 240, height: 24, style: 'snowBridge' },
      { x: 270, y: 430, width: 98, height: 24 },
      { x: 200, y: 340, width: 48, height: 18 },
      { x: 370, y: 600, width: 50, height: 50, style: 'iceCube' },
    ];
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d');
    const modes = {
      vector: () => {
        for (const { ground, ...platform } of platforms) vector.drawWinterVectorPlatformBack(ctx, platform, !!ground);
        for (const { ground, ...platform } of platforms) vector.drawWinterVectorPlatformFront(ctx, platform, !!ground);
      },
      painted: () => {
        for (const { ground, ...platform } of platforms) painted.drawPaintedWinterPlatform(ctx, platform, !!ground, false, images);
        for (const { ground, ...platform } of platforms) painted.drawPaintedWinterPlatform(ctx, platform, !!ground, true, images);
      },
    };
    const samples = {};
    for (const [name, draw] of Object.entries(modes)) {
      draw();
      const times = [];
      for (let i = 0; i < 12; i++) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const start = performance.now();
        draw();
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      samples[name] = { medianMs: times[6], minMs: times[0], maxMs: times.at(-1) };
    }
    return samples;
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
