// e2e/lighting-off-regression.spec.ts
//
// PR 1 (Integration Stub) regression: ?lighting=off must produce the same
// renderer behavior as default. In Part A both code paths are no-op, so this
// is a smoke test confirming the toggle parsing doesn't break anything.
// In Part B, this test gains teeth: the off path becomes a real fallback.

import { test, expect } from '@playwright/test';

async function startMatch(page: any, params: string) {
  await page.goto(`/?arena=meadow&bots=2&killLimit=8&${params}`);
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.waitForFunction(
    () => (window as any).__gameLoop?.getState()?.countdown === 0,
    { timeout: 10000 },
  );
}

test.describe('Lighting kill switch', () => {
  test('?lighting=off does not crash the renderer', async ({ page }) => {
    await startMatch(page, 'lighting=off');
    await page.waitForTimeout(1000);
    const isAlive = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      return loop && !loop.getState().matchOver;
    });
    expect(isAlive).toBe(true);
  });

  test('?lighting=on also boots cleanly', async ({ page }) => {
    await startMatch(page, 'lighting=on');
    await page.waitForTimeout(500);
    const isAlive = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      return loop && !loop.getState().matchOver;
    });
    expect(isAlive).toBe(true);
  });

  test('default (no param) boots cleanly', async ({ page }) => {
    await startMatch(page, '');
    await page.waitForTimeout(500);
    const isAlive = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      return loop && !loop.getState().matchOver;
    });
    expect(isAlive).toBe(true);
  });
});
