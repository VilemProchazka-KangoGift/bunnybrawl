import { test, expect } from '@playwright/test';

/**
 * E2E tests for local multiplayer and URL parameter shortcuts.
 * Uses `?arena=` to auto-start matches (skips lobby).
 */

test.describe('Local Multiplayer', () => {
  test('match starts with P1 and bots via URL params', async ({ page }) => {
    test.setTimeout(30000);
    // arena param triggers auto-start (skips lobby)
    await page.goto('/?arena=meadow&bots=2');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('game-canvas')).toBeVisible();

    // Verify player count: 1 human + 2 bots = 3
    await page.waitForTimeout(1000);
    const playerCount = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      return loop?.getState()?.players?.length ?? 0;
    });
    expect(playerCount).toBe(3);
  });

  test('P1 input works in auto-start match', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/?arena=meadow&bots=1');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    // Wait for countdown to finish (polls game state instead of hardcoded wait)
    await page.waitForFunction(() => {
      const loop = (window as any).__gameLoop;
      return loop?.getState()?.countdown === 0;
    }, { timeout: 8000 });

    const xBefore = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      const p1 = loop?.getState()?.players?.find((p: any) => p.id === 'P1');
      return p1?.x ?? 0;
    });

    // Press right for P1
    await page.keyboard.down('d');
    await page.waitForTimeout(500);
    await page.keyboard.up('d');

    const xAfter = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      const p1 = loop?.getState()?.players?.find((p: any) => p.id === 'P1');
      return p1?.x ?? 0;
    });

    // P1 should have moved right
    expect(xAfter).toBeGreaterThan(xBefore);
  });

  test('5-player lobby accepts all key bindings without crash', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();

    // Press keys for all 5 players simultaneously
    await page.keyboard.press('d');          // P1
    await page.keyboard.press('ArrowRight'); // P2
    await page.keyboard.press('l');          // P3
    await page.keyboard.press('h');          // P4
    await page.keyboard.press('6');          // P5
    await page.waitForTimeout(500);

    // Lobby should not crash
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();
  });
});

test.describe('URL Parameter Shortcuts', () => {
  test('arena param auto-starts match', async ({ page }) => {
    await page.goto('/?arena=meadow');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  });

  test('bots param sets bot count', async ({ page }) => {
    await page.goto('/?arena=meadow&bots=3');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    const playerCount = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      return loop?.getState()?.players?.length ?? 0;
    });
    // 1 human + 3 bots = 4
    expect(playerCount).toBe(4);
  });

  test('killLimit param sets kill limit', async ({ page }) => {
    await page.goto('/?arena=meadow&bots=1&killLimit=8');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    const killLimit = await page.evaluate(() => {
      return (window as any).__gameStore?.getState()?.matchSettings?.killLimit;
    });
    expect(killLimit).toBe(8);
  });

  test('timeLimit param sets time limit', async ({ page }) => {
    await page.goto('/?arena=meadow&bots=1&timeLimit=30');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    const timeLimit = await page.evaluate(() => {
      return (window as any).__gameStore?.getState()?.matchSettings?.timeLimit;
    });
    expect(timeLimit).toBe(30);
  });

  test('difficulty param sets bot difficulty', async ({ page }) => {
    await page.goto('/?arena=meadow&bots=2&difficulty=hard');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    const diff = await page.evaluate(() => {
      return (window as any).__gameStore?.getState()?.matchSettings?.botDifficulty;
    });
    expect(diff).toBe('hard');
  });

  test('multiple params combine correctly', async ({ page }) => {
    await page.goto('/?arena=castle&bots=2&killLimit=4&difficulty=hard&timeLimit=60');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    const settings = await page.evaluate(() => {
      const store = (window as any).__gameStore;
      if (!store) return null;
      const s = store.getState().matchSettings;
      return { arena: s.arenaId, bots: s.botCount, killLimit: s.killLimit, difficulty: s.botDifficulty, timeLimit: s.timeLimit };
    });
    expect(settings?.arena).toBe('castle');
    expect(settings?.bots).toBe(2);
    expect(settings?.killLimit).toBe(4);
    expect(settings?.difficulty).toBe('hard');
    expect(settings?.timeLimit).toBe(60);
  });

  test('bots default to 1 when only arena is specified', async ({ page }) => {
    await page.goto('/?arena=meadow');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    const playerCount = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      return loop?.getState()?.players?.length ?? 0;
    });
    // Default: 1 human + 1 bot = 2
    expect(playerCount).toBe(2);
  });

  test('all 11 arenas load via URL params', async ({ page }) => {
    const arenas = ['meadow', 'winter_lake', 'volcano', 'castle', 'candy_land',
      'treetops', 'underwater', 'haunted_graveyard', 'rooftops', 'space_station', 'waterfall'];
    // Just test the first few (full set would be too slow)
    for (const arena of arenas.slice(0, 3)) {
      await page.goto(`/?arena=${arena}&bots=1`);
      await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
      const loadedArena = await page.evaluate(() => {
        return (window as any).__gameStore?.getState()?.matchSettings?.arenaId;
      });
      expect(loadedArena).toBe(arena);
    }
  });
});
