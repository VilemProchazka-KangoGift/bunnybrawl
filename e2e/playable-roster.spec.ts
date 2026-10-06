import { test, expect } from '@playwright/test';

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
