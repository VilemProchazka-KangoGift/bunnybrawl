import { test, expect } from '@playwright/test';

test('preloads the plush roster while the menu stays usable', async ({ page }) => {
  const assets = new Set<string>();
  page.on('response', response => {
    const file = new URL(response.url()).pathname.split('/').pop() ?? '';
    if (file.endsWith('.webp')) assets.add(file.split('-')[0]);
  });
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('play-button')).toBeEnabled();
  await expect.poll(() => assets.size, { timeout: 20_000 }).toBe(19);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('char-select')).toBeVisible();
});

test('does not preload plush art in classic comparison mode', async ({ page }) => {
  const assets: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('.webp')) assets.push(request.url());
  });
  await page.goto('/?classicCharacters=1');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(assets).toHaveLength(0);
});

test('keeps an immediate Online click clear of plush downloads', async ({ page }) => {
  const assets: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('.webp')) assets.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByTestId('online-btn').click();
  await expect(page.locator('.online-modal')).toBeVisible();
  expect(assets).toHaveLength(0);
});

test('prefetches match code and arena packs while players choose', async ({ page }) => {
  const requested = new Set<string>();
  page.on('request', request => {
    const file = new URL(request.url()).pathname.split('/').pop() ?? '';
    if (/^(Match|builtin)-.+\.js$/.test(file)) requested.add(file.split('-')[0]);
  });
  await page.goto('/?classicCharacters=1');
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('char-select')).toBeVisible();
  await expect.poll(() => [...requested].sort()).toEqual(['Match', 'builtin']);
});

for (const mode of ['default', 'simWorker=off'] as const) {
  test(`loads the complete Pocket Plush roster in a playable match (${mode})`, async ({ page }) => {
    const assets = new Set<string>();
    page.on('response', response => {
      const file = new URL(response.url()).pathname.split('/').pop() ?? '';
      if (file.endsWith('.webp')) assets.add(file.split('-')[0]);
    });
    const query = mode === 'default' ? '' : '&simWorker=off';
    await page.goto(`/?arena=meadow&bots=1${query}`);
    await expect(page.getByTestId('match-screen')).toBeVisible();
    await expect.poll(() => assets.size).toBe(19);
    expect(assets).toContain('cow');
    expect(assets).toContain('hedgehog');
    await page.waitForFunction(() => window.__bunnyTest?.state()?.players?.length === 2);
  });
}

test('keeps the procedural roster available for comparison', async ({ page }) => {
  const assets: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('.webp')) assets.push(request.url());
  });
  await page.goto('/?arena=meadow&bots=1&classicCharacters=1');
  await expect(page.getByTestId('match-screen')).toBeVisible();
  expect(assets).toHaveLength(0);
});
