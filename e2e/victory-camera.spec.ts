import { test, expect } from '@playwright/test';
for (const mode of ['', '&simWorker=off']) {
  test(`winner zoom plays before results ${mode || 'sim worker'}`, async ({ page }) => {
    test.setTimeout(100000);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`./?arena=meadow&bots=4&killLimit=2&difficulty=hard${mode}`);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.matchOver, undefined, { timeout: 75000, polling: 50 });
    await page.screenshot({ path: `docs/mockups/victory-celebration/captures/live-start-${mode ? 'renderer-worker' : 'sim-worker'}.png` });
    await page.waitForTimeout(3100);
    await expect(page.getByTestId('victory-screen')).toHaveCount(0);
    await page.screenshot({ path: `docs/mockups/victory-celebration/captures/live-${mode ? 'renderer-worker' : 'sim-worker'}.png` });
    await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 5000 });
    expect(errors).toEqual([]);
  });
}
