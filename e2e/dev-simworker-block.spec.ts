// Verifies sim-in-worker reaches phase=playing on the dev server.
//
// History: this used to be a "dev block" guard around the worker
// TLA-ordering hang in `audio/howlShim.ts`. That shim was deleted when
// character audio factories moved out of the visual packs into per-pack
// `*.audio.ts` files imported only from the main bundle. With Howler
// gone from the worker module graph the hang is gone, so this spec now
// asserts the positive case: `?simWorker=on` in dev actually runs the
// simulator inside the worker (isRemoteSim === true) without hanging.
//
// Other E2E specs run against `vite preview` (prod build). This one
// runs against the dev server because dev was the broken path.

import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173/bunnybrawl/' });

test('?simWorker=on works on the dev server (sim runs inside worker)', async ({ page }) => {
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
  expect(isRemoteSim, 'sim should run inside the worker on the dev server').toBe(true);
});
