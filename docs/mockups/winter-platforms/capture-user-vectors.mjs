import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.WINTER_PLATFORM_URL ?? 'http://127.0.0.1:4232/bunnybrawl/';
const browser = await chromium.launch({ headless: true });
try {
  for (const name of ['a', 'b']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 500 }, deviceScaleFactor: 1 });
    const url = new URL(`docs/mockups/winter-platforms/user-vector-tool-${name}.svg`, server);
    await page.setContent(`<style>body{margin:0;background:#a7bfd1} img{display:block;width:1280px;height:auto}</style><img src="${url.href}">`);
    await page.locator('img').evaluate(async image => {
      if (!image.complete) await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    });
    await page.locator('img').screenshot({ path: join(directory, `user-vector-tool-${name}-preview.png`) });
    await page.close();
  }
} finally {
  await browser.close();
}
