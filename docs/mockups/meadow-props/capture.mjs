import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['current', 'storybook', 'woodcut', 'botanical', 'leafy', 'animation', 'leafyAiry', 'leafyBloom', 'leafyDusky', 'shrubBranch', 'shrubHedge', 'shrubBramble', 'shrubBloom'];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const time of ['day', 'night']) {
    for (const variant of variants) {
      const url = `http://127.0.0.1:4190/bunnybrawl/docs/mockups/meadow-props/render.html?variant=${variant}&time=${time}`;
      await page.goto(url);
      await page.locator('html[data-ready="true"]').waitFor({ timeout: 15000 });
      await page.locator('.scene').screenshot({ path: join(here, `${variant}-${time}.png`) });
      console.log(`${variant}-${time}.png captured`);
    }
  }
  await page.setViewportSize({ width: 1680, height: 760 });
  await page.goto('http://127.0.0.1:4190/bunnybrawl/docs/mockups/meadow-props/details.html');
  await page.locator('html[data-ready="true"]').waitFor({ timeout: 15000 });
  await page.locator('#details').screenshot({ path: join(here, 'details.png') });
  console.log('details.png captured');
  await page.goto('http://127.0.0.1:4190/bunnybrawl/docs/mockups/meadow-props/details.html?set=leafy');
  await page.locator('html[data-ready="true"]').waitFor({ timeout: 15000 });
  await page.locator('#details').screenshot({ path: join(here, 'details-leafy.png') });
  console.log('details-leafy.png captured');
  await page.setViewportSize({ width: 2100, height: 760 });
  await page.goto('http://127.0.0.1:4190/bunnybrawl/docs/mockups/meadow-props/details.html?set=shrubs');
  await page.locator('html[data-ready="true"]').waitFor({ timeout: 15000 });
  await page.locator('#details').screenshot({ path: join(here, 'details-shrubs.png') });
  console.log('details-shrubs.png captured');
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
