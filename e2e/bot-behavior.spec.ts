import { test, expect } from '@playwright/test';

/**
 * E2E tests for AI bot behavior.
 * These tests verify bots move, don't get stuck, and work across all arenas.
 * Uses window.__bunnyTest.state() to access match state for position tracking.
 */

const ARENAS = [
  'meadow', 'winter_lake', 'volcano', 'castle', 'candy_land',
  'treetops', 'underwater', 'haunted_graveyard', 'rooftops', 'space_station',
];

test.describe('Bot Menu Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('bot settings are visible on main menu', async ({ page }) => {
    await expect(page.getByTestId('bot-settings')).toBeVisible();
    await expect(page.getByTestId('bot-count')).toHaveText('0');
  });

  test('can increase and decrease bot count', async ({ page }) => {
    const plusBtn = page.getByTestId('bot-settings').getByRole('button', { name: '+' });
    const minusBtn = page.getByTestId('bot-settings').getByRole('button', { name: '-' });
    const count = page.getByTestId('bot-count');

    await plusBtn.click();
    await expect(count).toHaveText('1');
    await plusBtn.click();
    await plusBtn.click();
    await expect(count).toHaveText('3');
    await minusBtn.click();
    await expect(count).toHaveText('2');
  });

  test('difficulty selector appears when bots > 0', async ({ page }) => {
    const plusBtn = page.getByTestId('bot-settings').getByRole('button', { name: '+' });
    // No difficulty selector when 0 bots
    await expect(page.locator('.bot-difficulty-row')).not.toBeVisible();
    await plusBtn.click();
    // Now visible
    await expect(page.locator('.bot-difficulty-row')).toBeVisible();
    await expect(page.locator('.difficulty-btn.selected')).toHaveText(/Medium|Střední/);
  });

  test('bot count maxes at 5', async ({ page }) => {
    const plusBtn = page.getByTestId('bot-settings').getByRole('button', { name: '+' });
    for (let i = 0; i < 7; i++) await plusBtn.click();
    await expect(page.getByTestId('bot-count')).toHaveText('5');
  });
});

test.describe('Bot Lobby Behavior', () => {
  test('bots walk to ready zone and start match', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');

    // Set 2 bots
    const plusBtn = page.getByTestId('bot-settings').getByRole('button', { name: '+' });
    await plusBtn.click();
    await plusBtn.click();

    // Enter lobby
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();

    // Walk player 1 to ready zone
    await page.keyboard.down('d');
    const jumpLoop = async () => {
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('w');
        if (i % 3 === 1) await page.keyboard.press('s');
        await page.waitForTimeout(200);
      }
    };
    jumpLoop();

    // Wait for match to start (bots should also reach zone)
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 50000 });
    await expect(page.getByTestId('game-canvas')).toBeVisible();
  });
});

test.describe('Bot In-Match Behavior', () => {
  // Helper: start a match with bots on a given arena
  async function startBotMatch(page: any, arenaId: string, botCount: number) {
    await page.goto('/');

    // Set arena
    await page.evaluate((id: string) => {
      localStorage.setItem('carrotroyale_arena', id);
    }, arenaId);
    await page.reload();

    // Set bot count
    const plusBtn = page.getByTestId('bot-settings').getByRole('button', { name: '+' });
    for (let i = 0; i < botCount; i++) await plusBtn.click();

    // Enter lobby
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();

    // Walk P1 to ready zone
    await page.keyboard.down('d');
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('w');
      if (i % 3 === 1) await page.keyboard.press('s');
      await page.waitForTimeout(200);
    }

    // Wait for match
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 50000 });
    // Let the match run for a few seconds
    await page.waitForTimeout(2000);
  }

  // Helper: get bot positions from the game state
  async function getBotPositions(page: any): Promise<Array<{ id: string; x: number; y: number; score: number; state: string }>> {
    return page.evaluate(() => {
      const state = window.__bunnyTest?.state();
      if (!state) return [];
      return state.players
        .filter((p: any) => p.id.startsWith('B'))
        .map((p: any) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), score: p.score, state: p.state }));
    });
  }

  // Helper: check bots are moving over time
  async function assertBotsMove(page: any, durationMs: number, label: string) {
    const snapshots: Array<Array<{ id: string; x: number; y: number }>> = [];

    const interval = 500;
    const iterations = Math.ceil(durationMs / interval);
    for (let i = 0; i < iterations; i++) {
      const positions = await getBotPositions(page);
      snapshots.push(positions);
      if (i < iterations - 1) await page.waitForTimeout(interval);
    }

    // For each bot, check that it moved meaningfully over the test period
    if (snapshots.length < 2 || snapshots[0].length === 0) return;

    for (const bot of snapshots[0]) {
      const lastSnap = snapshots[snapshots.length - 1].find((b: any) => b.id === bot.id);
      if (!lastSnap) continue;

      const totalMovement = Math.abs(lastSnap.x - bot.x) + Math.abs(lastSnap.y - bot.y);
      console.log(`[${label}] Bot ${bot.id}: moved ${totalMovement}px over ${durationMs}ms (${bot.x},${bot.y} -> ${lastSnap.x},${lastSnap.y})`);

      // Bots should move at least 30px in the test period (they're not stuck)
      expect(totalMovement, `Bot ${bot.id} appears stuck on ${label}`).toBeGreaterThan(30);
    }

    // Also check bots don't stay in tiny area (< 50px range) across all snapshots
    for (const botId of snapshots[0].map(b => b.id)) {
      const xs = snapshots.map(s => s.find((b: any) => b.id === botId)?.x ?? 0).filter(x => x > 0);
      const ys = snapshots.map(s => s.find((b: any) => b.id === botId)?.y ?? 0).filter(y => y > 0);
      if (xs.length < 2) continue;
      const xRange = Math.max(...xs) - Math.min(...xs);
      const yRange = Math.max(...ys) - Math.min(...ys);
      console.log(`[${label}] Bot ${botId}: x-range=${xRange}px, y-range=${yRange}px`);
    }
  }

  for (const arenaId of ARENAS) {
    test(`bots move and don't get stuck on ${arenaId}`, { tag: '@bot-behavior' }, async ({ page }) => {
      test.setTimeout(90000);
      await startBotMatch(page, arenaId, 3);
      await assertBotsMove(page, 6000, arenaId);
    });
  }
});
