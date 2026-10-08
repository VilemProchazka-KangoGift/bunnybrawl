import { test, expect } from '@playwright/test';

for (const mode of ['default', 'simWorker=off']) {
  test(`storybook sky renders in ${mode}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/?arena=meadow&bots=2&killLimit=100${mode === 'default' ? '' : '&simWorker=off'}`);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
    await page.waitForFunction(mode => mode === 'default'
      ? !!window.__engineWorkerProxy
      : !!window.__rendererProxy && !window.__engineWorkerProxy, mode);
    await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
    await page.waitForFunction(() => window.__bunnyTest?.state()?.countdown === 0);
    if (mode === 'default') {
      // Worker owns simulation state; the host snapshot cannot pin its phase.
      await page.screenshot({ path: 'docs/mockups/sky-art/meadow-day-default.png' });
    } else {
      for (const [name, phase] of [['day', 0], ['sunset', .22], ['night', .5]] as const) {
        await page.evaluate(phase => {
          const w = window as typeof window & { skyPhaseTimer?: number };
          clearInterval(w.skyPhaseTimer);
          w.skyPhaseTimer = window.setInterval(() => {
            const s = window.__bunnyTest?.state();
            if (s) s.dayPhase = phase;
          }, 4);
        }, phase);
        await expect.poll(() => page.evaluate(() => window.__bunnyTest?.state()?.dayPhase ?? -1))
          .toBeGreaterThanOrEqual(phase);
        // Allow the renderer worker and DOM night compositing to consume the phase.
        await page.waitForTimeout(300);
        await page.screenshot({ path: `docs/mockups/sky-art/meadow-${name}-simWorker=off.png` });
      }
      await page.evaluate(() => clearInterval((window as typeof window & { skyPhaseTimer?: number }).skyPhaseTimer));
    }
    const start = await page.evaluate(() => window.__bunnyTest?.state()?.timeElapsed ?? 0);
    await expect.poll(() => page.evaluate(() => window.__bunnyTest?.state()?.timeElapsed ?? 0)).toBeGreaterThan(start + .3);
    expect(errors).toEqual([]);
  });
}
