import { test, expect } from '@playwright/test';

const isWinterBackdrop = (url: string) => /winter-lake-pearl-painted[^/]*\.webp$/.test(new URL(url).pathname);
const winterPropNames = ['winter-bush-leafy', 'winter-bush-hedge', 'winter-igloo'];
const isWinterProp = (url: string, name: string) => new URL(url).pathname.includes(name);
const winterPlatformNames = ['winter-shelf-painted', 'winter-bridge-painted', 'winter-cube-painted'];
const isArchivedPlatformImage = (url: string) => winterPlatformNames.some(name => new URL(url).pathname.includes(name));

test('prefetches Pearl Painted for a selected Winter Lake menu', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('carrotroyale_arena', 'winter_lake'));
  const backdrop = page.waitForResponse(response => isWinterBackdrop(response.url()));
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('play-button')).toBeEnabled();
  expect((await backdrop).status()).toBe(200);
});

test('prefetches Pearl Painted after choosing Winter Lake in the menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  const backdrop = page.waitForResponse(response => isWinterBackdrop(response.url()));
  await page.getByTestId('arena-selector').locator('.arena-disclosure').click();
  await page.locator('.arena-btn').filter({ hasText: '❄️' }).click();
  expect((await backdrop).status()).toBe(200);
  await expect(page.getByTestId('play-button')).toBeEnabled();
});

for (const mode of ['default', 'simWorker=off'] as const) {
  test(`loads Pearl Painted before a direct Winter Lake match (${mode})`, async ({ page }) => {
    const errors: string[] = [];
    const archivedPlatformRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (isArchivedPlatformImage(request.url())) archivedPlatformRequests.push(request.url()); });
    const backdrop = page.waitForResponse(response => isWinterBackdrop(response.url()));
    const props = winterPropNames.map(name => page.waitForResponse(response => isWinterProp(response.url(), name)));
    const query = mode === 'default' ? '' : '&simWorker=off';
    await page.goto(`/?arena=winter_lake&bots=1${query}`);
    expect((await backdrop).status()).toBe(200);
    expect((await Promise.all(props)).map(response => response.status())).toEqual([200, 200, 200]);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
    await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
    expect(archivedPlatformRequests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`loads Pearl Painted when switching into Winter Lake (${mode})`, async ({ page }) => {
    const query = mode === 'default' ? '' : '&simWorker=off';
    await page.goto(`/?arena=rooftops&bots=1${query}`);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pause-overlay')).toBeVisible();
    await page.locator('.level-btn').first().click();
    const backdrop = page.waitForResponse(response => isWinterBackdrop(response.url()));
    const archivedPlatformRequests: string[] = [];
    page.on('request', request => { if (isArchivedPlatformImage(request.url())) archivedPlatformRequests.push(request.url()); });
    await page.locator('.pause-arena-btn').filter({ hasText: '❄️' }).click();
    expect((await backdrop).status()).toBe(200);
    await page.waitForFunction(() =>
      window.__bunnyTest?.state()?.phase === 'playing'
      && window.__bunnyTest?.gameLoop()?.getArena().id === 'winter_lake',
    );
    await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
    expect(archivedPlatformRequests).toEqual([]);
  });
}
