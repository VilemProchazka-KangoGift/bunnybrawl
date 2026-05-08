import { test, expect } from '@playwright/test';

/**
 * Phase 2 smoke: validate that the WorkerHost + transferControlToOffscreen
 * pipeline works in the production Vite build inside Match.tsx.
 *
 * Loads with `?workerSmoke=1` so the corner overlay mounts. Asserts:
 *  - The worker reports ready (data-ready=1).
 *  - No worker error surfaced.
 *  - The transferred canvas has actually been drawn into (non-blank pixels).
 */

test('worker-smoke overlay paints from worker', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await page.goto('/?arena=meadow&bots=2&killLimit=4&workerSmoke=1');
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });

  const smoke = page.getByTestId('worker-smoke');
  await expect(smoke).toBeVisible();
  await expect(smoke).toHaveAttribute('data-ready', '1', { timeout: 5000 });
  await expect(smoke).toHaveAttribute('data-error', '');

  // The worker draws an HSL rect every frame — let it tick a few RAFs and
  // sample the canvas backing store via pixel readback. Smoke canvas is
  // 160×90, drawn opaque, so a non-zero alpha at the centre is sufficient.
  await page.waitForTimeout(200);

  const painted = await smoke.locator('canvas').evaluate((el) => {
    const c = el as HTMLCanvasElement;
    // The canvas was transferred to the worker — getContext on the main
    // thread will fail. Instead, read back via toDataURL which works on
    // a transferred canvas in the host process. Length check is a proxy
    // for "non-blank" since a fully blank png compresses to a tiny URL.
    const url = c.toDataURL();
    return url.length;
  });
  // Empty 160×90 canvas → ~140-byte data URL. Worker-painted canvas with
  // a colored rect + text → multi-kB.
  expect(painted).toBeGreaterThan(2000);

  // No errors reported by the page or the worker.
  expect(errors).toEqual([]);
});
