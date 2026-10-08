import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const server = process.env.WINTER_PLATFORM_URL ?? 'http://127.0.0.1:4225/bunnybrawl/';
const variants = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
try {
  for (const variant of variants.length ? variants : ['production', 'glacial-ceramic', 'storybook-glaze', 'painted-sprite', 'painted-scalable', 'vector-replica', 'vector-trace']) {
    for (const time of ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const platformQuery = variant === 'production' ? '' : `&platform=${variant}`;
      const url = new URL(`docs/mockups/winter-lake/render.html?variant=current${platformQuery}&time=${time}`, server);
      const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) throw new Error(`${variant} ${time}: HTTP ${response?.status()}`);
      await page.locator('html[data-ready="true"]').waitFor({ timeout: 30000 });
      if (errors.length) throw new Error(`${variant} ${time}: ${errors.join('; ')}`);
      await page.locator('.scene').screenshot({ path: join(directory, `${variant}-${time}.png`) });
      await page.close();
      console.log(`${variant}-${time}.png`);
    }
  }
  const study = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
  await study.goto(new URL('docs/mockups/winter-platforms/sizing.html', server).href, { waitUntil: 'domcontentloaded' });
  await study.locator('html[data-ready="true"]').waitFor({ timeout: 30000 });
  await study.locator('#study').screenshot({ path: join(directory, 'painted-scaling-study.png') });
  await study.close();
  console.log('painted-scaling-study.png');
  if (!variants.length || variants.includes('vector-replica')) {
    const vectorStudy = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
    await vectorStudy.goto(new URL('docs/mockups/winter-platforms/sizing.html?renderer=vector', server).href, { waitUntil: 'domcontentloaded' });
    await vectorStudy.locator('html[data-ready="true"]').waitFor({ timeout: 30000 });
    await vectorStudy.locator('#study').screenshot({ path: join(directory, 'vector-scaling-study.png') });
    await vectorStudy.close();
    console.log('vector-scaling-study.png');
  }
  if (!variants.length || variants.includes('vector-trace')) {
    const traceStudy = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
    await traceStudy.goto(new URL('docs/mockups/winter-platforms/sizing.html?renderer=trace', server).href, { waitUntil: 'domcontentloaded' });
    await traceStudy.locator('html[data-ready="true"]').waitFor({ timeout: 30000 });
    await traceStudy.locator('#study').screenshot({ path: join(directory, 'vector-trace-scaling-study.png') });
    await traceStudy.close();
    console.log('vector-trace-scaling-study.png');
  }
} finally {
  await browser.close();
}
