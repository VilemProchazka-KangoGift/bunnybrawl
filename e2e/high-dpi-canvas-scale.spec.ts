// Regression: on high-DPI displays the worker bumps the OffscreenCanvas
// bitmap to 1280×scale, which syncs back to the main HTMLCanvasElement's
// intrinsic size. Without `canvas.style.width/height` pinned to logical
// (1280×720) on main, the canvas displays at the bumped intrinsic and
// only the upper-left quadrant of the arena is visible inside GameScaler's
// 1280×720 container.
//
// Default Playwright Chromium runs at deviceScaleFactor=1 so the prior
// E2E sweep never tripped this — DPR-aware suites must opt in.

import { test, expect, type Browser } from '@playwright/test';

async function assertCanvasLogicalSize(browser: Browser, label: string, query: string): Promise<void> {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto(query);
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(
      () => (window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } })
        .__bunnyTest?.state?.()?.phase === 'playing',
      undefined,
      { timeout: 15000 },
    );
    // Give the worker one frame to settle its first applyRenderScaleToCanvas.
    await page.waitForTimeout(100);

    const dims = await page.evaluate(() => {
      const fg = document.querySelector('canvas.fg-canvas') as HTMLCanvasElement | null;
      const bg = document.querySelector('canvas.bg-canvas') as HTMLCanvasElement | null;
      if (!fg || !bg) return null;
      const fgRect = fg.getBoundingClientRect();
      const bgRect = bg.getBoundingClientRect();
      return {
        dpr: window.devicePixelRatio,
        fg: { rectW: fgRect.width, rectH: fgRect.height, intrinsicW: fg.width, intrinsicH: fg.height, styleW: fg.style.width, styleH: fg.style.height },
        bg: { rectW: bgRect.width, rectH: bgRect.height, intrinsicW: bg.width, intrinsicH: bg.height, styleW: bg.style.width, styleH: bg.style.height },
      };
    });
    expect(dims, `${label}: canvases missing`).not.toBeNull();
    expect(dims!.dpr, `${label}: expected DPR=2 for the regression test`).toBe(2);
    // Logical display size must be 1280×720 (GameScaler then transforms to
    // the viewport). The intrinsic backing-store can be 1280 (main mode) or
    // 1280×DPR (worker mode) — both are valid as long as the displayed size
    // is logical.
    expect(dims!.fg.rectW, `${label} fg displayed width`).toBe(1280);
    expect(dims!.fg.rectH, `${label} fg displayed height`).toBe(720);
    expect(dims!.bg.rectW, `${label} bg displayed width`).toBe(1280);
    expect(dims!.bg.rectH, `${label} bg displayed height`).toBe(720);
  } finally {
    await context.close();
  }
}

test('canvas displays at logical 1280×720 on DPR=2 (renderer-only worker — default)', async ({ browser }) => {
  await assertCanvasLogicalSize(browser, 'default', '?arena=meadow&bots=2');
});

test('canvas displays at logical 1280×720 on DPR=2 (sim-in-worker)', async ({ browser }) => {
  await assertCanvasLogicalSize(browser, 'simWorker=on', '?arena=meadow&bots=2&simWorker=on');
});
