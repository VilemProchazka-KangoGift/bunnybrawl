// e2e/lighting-baseline.spec.ts
//
// Visual regression: pin the meadow-noon lighting composite so unintentional
// lighting shifts (ambient color changes, sun intensity drift, blend mode bugs)
// are caught. Single screenshot in M1 — L2+ extends as features stabilize.
//
// Threshold note: the meadow arena has animated wildlife, clouds, and weather.
// We freeze the canvas by stopping the RAF loop (stop() cancels rAF so no
// further repaints). The baseline is captured at a fixed animation moment by
// running for exactly countdown=0 then immediately stopping.
// 8% threshold absorbs the ~3-5% pixel variance from animation state at the
// capture moment while still catching real lighting regressions (which shift
// large regions of mid-tone pixels by >10%).

import { test, expect } from '@playwright/test';

test('meadow noon default lighting baseline', async ({ page }) => {
  await page.goto('/?arena=meadow&bots=0&killLimit=8');
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('game-canvas')).toBeVisible();

  // Wait for countdown to clear
  await page.waitForFunction(
    () => window.__bunnyTest?.state()?.countdown === 0,
    { timeout: 10000 },
  );

  // Pin dayPhase to noon (game convention: 0 = noon), stop the RAF loop so
  // the canvas freezes at the next frame, then immediately screenshot.
  await page.evaluate(() => {
    const bt = window.__bunnyTest;
    const s = bt?.state();
    if (s) s.dayPhase = 0;
    // stop() cancels requestAnimationFrame — canvas freezes after current frame.
    bt?.gameLoop()?.stop();
  });

  // One RAF cycle has been cancelled. Canvas is now frozen.
  await page.waitForTimeout(100);

  await expect(page.locator('[data-testid="game-canvas"]')).toHaveScreenshot(
    'meadow-noon-default.png',
    { maxDiffPixelRatio: 0.08 },
  );
});
