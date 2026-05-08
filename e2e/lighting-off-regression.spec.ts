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
    () => window.__bunnyTest?.state()?.countdown === 0,
    { timeout: 10000 },
  );
}

test.describe('Lighting kill switch', () => {
  test('?lighting=off does not crash the renderer', async ({ page }) => {
    await startMatch(page, 'lighting=off');
    await page.waitForTimeout(1000);
    const isAlive = await page.evaluate(() => {
      const s = window.__bunnyTest?.state();
      return !!s && !s.matchOver;
    });
    expect(isAlive).toBe(true);
  });

  test('?lighting=on also boots cleanly', async ({ page }) => {
    await startMatch(page, 'lighting=on');
    await page.waitForTimeout(500);
    const isAlive = await page.evaluate(() => {
      const s = window.__bunnyTest?.state();
      return !!s && !s.matchOver;
    });
    expect(isAlive).toBe(true);
  });

  test('default (no param) boots cleanly', async ({ page }) => {
    await startMatch(page, '');
    await page.waitForTimeout(500);
    const isAlive = await page.evaluate(() => {
      const s = window.__bunnyTest?.state();
      return !!s && !s.matchOver;
    });
    expect(isAlive).toBe(true);
  });

  test('?lighting=off keeps darkening overlays invisible at midnight', async ({ page }) => {
    await startMatch(page, 'lighting=off');
    // Pin dayPhase to midnight; with lighting off, both DOM darkening
    // overlays should stay at opacity 0.
    const opacities = await page.evaluate(() => {
      const id = setInterval(() => {
        const s = window.__bunnyTest?.state();
        if (s) s.dayPhase = 0.5;
      }, 4);
      return new Promise<{ bg: string; fg: string }>((resolve) => {
        setTimeout(() => {
          clearInterval(id);
          resolve({
            bg: (document.querySelector('.bg-night-canvas') as HTMLCanvasElement | null)?.style.opacity ?? '',
            fg: (document.querySelector('.fg-night-tint') as HTMLDivElement | null)?.style.opacity ?? '',
          });
        }, 800);
      });
    });
    expect(opacities.bg === '' || opacities.bg === '0').toBe(true);
    expect(opacities.fg === '' || opacities.fg === '0').toBe(true);
  });
});
