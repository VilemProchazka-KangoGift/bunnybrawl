// Regression: switching arenas mid-match must NOT remount Match.tsx.
// `handleChangeArena` calls `setMatchSettings({arenaId})` which used to be
// in `useLocalMatch` / `useOnlineMatch`'s effect deps, triggering an
// effect re-run. In worker modes the re-run terminated the worker and
// called `transferControlToOffscreen` on already-transferred canvases →
// InvalidStateError → permanent "Loading arena…" overlay.
//
// Covers renderer-only worker (default), sim-in-worker (`?simWorker=on`),
// and main-thread (`?worker=off`).

import { test, expect, type Page } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173/bunnybrawl/' });

async function switchArenaAndAssertPlaying(page: Page, query: string): Promise<void> {
  await page.goto(query);
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(
    () => (window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } })
      .__bunnyTest?.state?.()?.phase === 'playing',
    undefined,
    { timeout: 15000 },
  );

  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-overlay')).toBeVisible({ timeout: 5000 });
  await page.locator('.level-btn').first().click();

  const tiles = await page.locator('.pause-arena-btn').all();
  let target = null;
  for (const tile of tiles) {
    const cls = (await tile.getAttribute('class')) ?? '';
    if (!cls.includes('current')) { target = tile; break; }
  }
  expect(target, 'a non-current arena tile must exist').not.toBeNull();
  await target!.click();

  await page.waitForFunction(
    () => (window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } })
      .__bunnyTest?.state?.()?.phase === 'playing',
    undefined,
    { timeout: 12000 },
  );
  await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
}

test('arena switch mid-match reaches phase=playing (renderer-only worker — default)', async ({ page }) => {
  await switchArenaAndAssertPlaying(page, '?arena=meadow&bots=2');
});

test('arena switch mid-match reaches phase=playing (sim-in-worker)', async ({ page }) => {
  await switchArenaAndAssertPlaying(page, '?arena=meadow&bots=2&simWorker=on');
});

test('arena switch mid-match reaches phase=playing (main-thread)', async ({ page }) => {
  await switchArenaAndAssertPlaying(page, '?arena=meadow&bots=2&worker=off');
});
