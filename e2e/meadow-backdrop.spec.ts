import { test, expect } from '@playwright/test';

const isMeadowBackdrop = (url: string) => /meadow-low-valley[^/]*\.webp$/.test(new URL(url).pathname);

test('prefetches the Meadow backdrop while the menu remains usable', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => {
    if (isMeadowBackdrop(request.url())) requests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('play-button')).toBeEnabled();
  await expect.poll(() => requests.length, { timeout: 15000 }).toBe(1);
});

for (const mode of ['default', 'simWorker=off'] as const) {
  test(`loads the painted backdrop before a direct Meadow match plays (${mode})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const backdrop = page.waitForResponse(response => isMeadowBackdrop(response.url()));
    const query = mode === 'default' ? '' : '&simWorker=off';
    await page.goto(`/?arena=meadow&bots=1${query}`);
    expect((await backdrop).status()).toBe(200);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
    await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`loads the backdrop when switching into Meadow (${mode})`, async ({ page }) => {
    const query = mode === 'default' ? '' : '&simWorker=off';
    await page.goto(`/?arena=rooftops&bots=1${query}`);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pause-overlay')).toBeVisible();
    await page.locator('.level-btn').first().click();
    const backdrop = page.waitForResponse(response => isMeadowBackdrop(response.url()));
    await page.locator('.pause-arena-btn').first().click();
    expect((await backdrop).status()).toBe(200);
    await page.waitForFunction(() =>
      window.__bunnyTest?.state()?.phase === 'playing'
      && window.__bunnyTest?.gameLoop()?.getArena().id === 'meadow',
    );
    await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
  });
}
