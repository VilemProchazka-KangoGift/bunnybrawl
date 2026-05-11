// Verifies the dev-mode simWorker block: `?simWorker=on` in dev must NOT
// hang at phase=loading. SIM_WORKER_DEV_BLOCKED forces the flag off at
// boot, so the URL request is ignored and the local-match path uses the
// non-worker (or renderer-only worker) fallback.
//
// Runs against the dev server (not preview) — that's where the block
// matters. Other E2E specs run against preview by default.

import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173/bunnybrawl/' });

test('?simWorker=on in dev does not soft-brick (dev-block fallback reaches phase=playing)', async ({ page }) => {
  await page.goto('?arena=meadow&bots=2&simWorker=on');
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(
    () => (window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } })
      .__bunnyTest?.state?.()?.phase === 'playing',
    undefined,
    { timeout: 15000 },
  );
  const isRemoteSim = await page.evaluate(() => {
    const t = (window as unknown as { __bunnyTest?: { gameLoop?: () => { isRemoteSim?: () => boolean } } }).__bunnyTest;
    return t?.gameLoop?.()?.isRemoteSim?.() === true;
  });
  expect(isRemoteSim, 'dev should NOT be on the simWorker proxy').toBe(false);
});
