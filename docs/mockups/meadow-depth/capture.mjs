// Run from the repo root with Vite serving on port 4190:
// node docs/mockups/meadow-depth/capture.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
  for (const time of ['day', 'night']) {
    for (const option of ['current', 'a', 'b', 'c']) {
      const page = await browser.newPage({viewport: {width:1280, height:720}, deviceScaleFactor:1});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Freeze visual timers without changing the renderer itself.
      await page.addInitScript(() => {performance.now = () => 18000; Date.now = () => 18000;});
      await page.goto(`http://127.0.0.1:4190/bunnybrawl/docs/mockups/meadow-depth/render.html?option=${option}&time=${time}`);
      await page.waitForSelector('html[data-ready="true"]', {timeout:20000});
      if (errors.length) throw new Error(errors.join('\n'));
      await page.locator('.scene').screenshot({path:fileURLToPath(new URL(`./${option}-${time}.png`, import.meta.url))});
      console.log(`${option}-${time}: captured without browser errors`);
      await page.close();
    }
  }
  const comparison = await browser.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:1});
  const comparisonErrors = [];
  comparison.on('pageerror', error => comparisonErrors.push(error.message));
  await comparison.goto('http://127.0.0.1:4190/bunnybrawl/docs/mockups/meadow-depth/index.html');
  await comparison.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth === 1280));
  await comparison.locator('#overview').screenshot({path:fileURLToPath(new URL('./overview.png', import.meta.url))});
  await comparison.getByRole('button', {name:'C · Cool woodland'}).click();
  await comparison.getByRole('button', {name:'Midnight'}).click();
  assert.equal(await comparison.locator('#after').getAttribute('src'), 'c-night.png');
  assert.equal(await comparison.locator('#before').getAttribute('src'), 'current-night.png');
  await comparison.locator('input').evaluate(el => {el.value = '25'; el.dispatchEvent(new Event('input', {bubbles:true}));});
  assert.equal(await comparison.locator('.divider').evaluate(el => el.style.left), '25%');
  await comparison.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth === 1280));
  assert.deepEqual(comparisonErrors, []);
  console.log('comparison: palette, midnight toggle, divider and image loading verified');
  console.log('overview: captured');
} finally {await browser.close();}
