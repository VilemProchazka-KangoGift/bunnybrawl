// Regression: tapping the jump key (P1=W) while airborne must NOT trigger
// fast-fall. Physics gates jump on grounded state, so an airborne press
// should be a no-op. `RemoteInput.getAction` used to convert airborne+jump
// to `{down: true}` for the touch path, which leaked into sim-worker's
// local human (and online keyboard guests) as a regression — every W tap
// in mid-air snapped vy to FAST_FALL_INITIAL.

import { test, expect, type Page } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173/bunnybrawl/' });

type Probe = { __bunnyTest?: {
  state?: () => {
    phase?: string;
    countdown?: number;
    players?: ReadonlyArray<{ state?: string; vy?: number; fastFalling?: boolean }>;
  };
} };

async function readSelf(page: Page): Promise<{ state?: string; vy?: number; fastFalling?: boolean }> {
  return page.evaluate(() => {
    const p = (window as unknown as Probe).__bunnyTest?.state?.()?.players?.[0];
    return { state: p?.state, vy: p?.vy, fastFalling: p?.fastFalling };
  });
}

async function jumpTapInAirNoFastfall(page: Page, query: string): Promise<void> {
  await page.goto(query);
  await page.waitForFunction(
    () => (window as unknown as Probe).__bunnyTest?.state?.()?.phase === 'playing',
    undefined,
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => ((window as unknown as Probe).__bunnyTest?.state?.()?.countdown ?? 1) <= 0,
    undefined,
    { timeout: 8000 },
  );
  // Settle one mirror cycle (sim-worker mirrors state at 5Hz).
  await page.waitForTimeout(400);

  // First jump.
  await page.keyboard.press('w');
  // Mid-rise: still airborne, vy strongly negative.
  await page.waitForTimeout(120);
  const beforeTap = await readSelf(page);
  expect(beforeTap.state, 'player must be airborne before mid-air W tap').toBe('airborne');
  expect(beforeTap.vy ?? 0, 'player must be rising before mid-air W tap').toBeLessThan(0);

  // Second W tap while airborne — this is the regression trigger.
  await page.keyboard.press('w');
  await page.waitForTimeout(60);
  const afterTap = await readSelf(page);

  expect(afterTap.fastFalling, 'mid-air jump tap must not set fastFalling').toBe(false);
  // FAST_FALL_INITIAL is a strongly positive vy snap; rising/falling under
  // gravity alone keeps vy well below it for the first few frames.
  expect(afterTap.vy ?? 0, 'mid-air jump tap must not snap vy to FAST_FALL_INITIAL').toBeLessThan(300);
}

test('mid-air jump tap is a no-op (renderer-only worker — default)', async ({ page }) => {
  await jumpTapInAirNoFastfall(page, '?arena=meadow&bots=0');
});

test('mid-air jump tap is a no-op (sim-in-worker)', async ({ page }) => {
  await jumpTapInAirNoFastfall(page, '?arena=meadow&bots=0&simWorker=on');
});

test('mid-air jump tap is a no-op (main-thread)', async ({ page }) => {
  await jumpTapInAirNoFastfall(page, '?arena=meadow&bots=0&worker=off');
});
