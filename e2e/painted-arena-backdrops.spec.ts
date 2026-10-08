import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carrotroyale_lang', 'en'));
});

const arenas = [
  ['rooftops', 'Rooftops'], ['treetops', 'Treetops'], ['waterfall', 'Waterfall'],
  ['volcano', 'Volcano'], ['castle', 'Castle'], ['haunted_graveyard', 'Haunted Graveyard'],
  ['candy_land', 'Candy Land'], ['underwater', 'Underwater'], ['space_station', 'Space Station'],
] as const;
for (const mode of ['default', 'simWorker=off']) for (const [arena, name] of arenas) {
  const query = mode === 'default' ? '' : '&simWorker=off';
  const isPlate = (url: string) => new URL(url).pathname.includes(`${arena.replaceAll('_', '-')}-painted`);
  test(`painted ${arena}: direct entry and switch (${mode})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    const plate = page.waitForResponse(r => isPlate(r.url()));
    await page.goto(`/?arena=${arena}&bots=1${query}`);
    expect((await plate).status()).toBe(200);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
    await page.waitForFunction((mode) => mode === 'default'
      ? !!window.__engineWorkerProxy
      : !!window.__rendererProxy && !window.__engineWorkerProxy, mode);
    await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
    const captureEdition = process.env.PAINTED_CAPTURE_EDITION ?? 'subtle';
    await page.screenshot({ path: `docs/mockups/painted-arenas/captures/${arena}-live-${captureEdition}-${mode}.png` });

    // A fresh realm ensures the switch must fetch and decode the new plate.
    await page.goto(`/?arena=meadow&bots=1${query}`);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pause-overlay')).toBeVisible();
    await page.locator('.level-btn').first().click();
    const switchedPlate = page.waitForResponse(r => isPlate(r.url()));
    await page.locator('.pause-arena-btn').filter({ hasText: name }).click();
    expect((await switchedPlate).status()).toBe(200);
    await page.waitForFunction((id) => window.__bunnyTest?.state()?.phase === 'playing'
      && window.__bunnyTest?.gameLoop()?.getArena().id === id, arena);
    const start = await page.evaluate(() => window.__bunnyTest?.state()?.timeElapsed ?? 0);
    await expect.poll(() => page.evaluate(() => window.__bunnyTest?.state()?.timeElapsed ?? 0)).toBeGreaterThan(start + 0.3);
    await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const mode of ['default', 'simWorker=off']) {
  test(`painted backdrop failure keeps the arena playable (${mode})`, async ({ page }) => {
    await page.route('**/*rooftops-painted*.webp', route => route.abort());
    await page.goto(`/?arena=rooftops&bots=1${mode === 'default' ? '' : '&simWorker=off'}`);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
    await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
    const start = await page.evaluate(() => window.__bunnyTest?.state()?.timeElapsed ?? 0);
    await expect.poll(() => page.evaluate(() => window.__bunnyTest?.state()?.timeElapsed ?? 0)).toBeGreaterThan(start + 0.3);
  });
}
