import { test, expect } from '@playwright/test';

/**
 * E2E tests for debug overlay rendering.
 * Tests navDebugOverlay.ts and net/debugOverlay.ts via URL params.
 */

async function startMatchWithDebug(
  page: any,
  debug: string,
  opts: { arena?: string; bots?: number } = {},
) {
  const arena = opts.arena ?? 'meadow';
  const bots = opts.bots ?? 2;
  await page.goto(`/?arena=${arena}&bots=${bots}&killLimit=16&debug=${debug}`);
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('game-canvas')).toBeVisible();
}

async function waitForCountdown(page: any, timeoutMs = 10000) {
  await page.waitForFunction(
    () => {
      const loop = (window as any).__gameLoop;
      if (!loop) return false;
      return loop.getState().countdown <= 0;
    },
    { timeout: timeoutMs },
  );
}

async function getDiag(page: any) {
  return page.evaluate(() => {
    const loop = (window as any).__gameLoop;
    if (!loop || !loop.getRendererDiagnostics) return null;
    return loop.getRendererDiagnostics();
  });
}

test.describe('Nav debug overlay', () => {
  test('renders nav graph when ?debug=nav is set', async ({ page }) => {
    await startMatchWithDebug(page, 'nav', { arena: 'meadow', bots: 2 });
    await waitForCountdown(page);

    const diag = await getDiag(page);
    expect(diag).not.toBeNull();
    expect(diag.navDebug).toBe(true);
  });

  test('renders nav graph on different arenas', async ({ page }) => {
    await startMatchWithDebug(page, 'nav', { arena: 'volcano', bots: 2 });
    await waitForCountdown(page);

    const diag = await getDiag(page);
    expect(diag.navDebug).toBe(true);
  });

  test('nav overlay toggles with backtick key', async ({ page }) => {
    await startMatchWithDebug(page, 'nav', { arena: 'meadow', bots: 2 });
    await waitForCountdown(page);

    // Verify it's on
    let diag = await getDiag(page);
    expect(diag.navDebug).toBe(true);

    // Toggle off with backtick
    await page.keyboard.press('Backquote');
    // Wait a frame for the flag to update
    await page.waitForTimeout(50);

    diag = await getDiag(page);
    expect(diag.navDebug).toBe(false);

    // Toggle back on
    await page.keyboard.press('Backquote');
    await page.waitForTimeout(50);

    diag = await getDiag(page);
    expect(diag.navDebug).toBe(true);
  });
});

test.describe('Net debug overlay', () => {
  test('net debug flag does not render without network stats', async ({ page }) => {
    // In local mode, netDebugStats is null, so overlay should not render
    // even with the flag set
    await startMatchWithDebug(page, 'net', { arena: 'meadow', bots: 2 });
    await waitForCountdown(page);

    const diag = await getDiag(page);
    expect(diag).not.toBeNull();
    // Net debug overlay only renders when _netDebugStats is set (online mode)
    // In local mode with ?debug=net, the flag is enabled but stats are null
    expect(diag.netDebug).toBe(false);
  });
});
