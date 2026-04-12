import { test, expect } from '@playwright/test';

/**
 * E2E tests for pause menu and victory screen.
 * Uses URL params (?arena=meadow&bots=2&...) to skip lobby and jump into match.
 * Bots play autonomously, so matches end naturally via kills or time limit.
 */

test.describe('Pause Menu', () => {
  test.beforeEach(async ({ page }) => {
    // Start a match directly via URL params (meadow, 2 bots, high kill limit so match doesn't end too fast)
    await page.goto('/?arena=meadow&bots=2&killLimit=99');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    // Wait for countdown to finish (polls game state)
    await page.waitForFunction(() => {
      const loop = (window as any).__gameLoop;
      return loop?.getState()?.countdown === 0;
    }, { timeout: 8000 });
  });

  test('Escape key opens pause menu during match', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();
  });

  test('Resume button closes pause menu', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();

    await page.getByTestId('resume-button').click();
    await expect(page.getByTestId('pause-menu')).not.toBeVisible();
    // Match screen should still be visible (game continues)
    await expect(page.getByTestId('match-screen')).toBeVisible();
  });

  test('Quit button returns to main menu', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();

    await page.getByTestId('quit-button').click();
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 5000 });
  });

  test('Pause menu shows arena selection grid', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();

    // Click "Change Level" button to show arena grid
    const changeLevelBtn = page.locator('.pause-btn.level-btn');
    await expect(changeLevelBtn).toBeVisible();
    await changeLevelBtn.click();

    // Arena grid should be visible with arena buttons
    const arenaButtons = page.locator('.pause-arena-btn');
    await expect(arenaButtons.first()).toBeVisible();
    // Should have multiple arenas (at least 5)
    const count = await arenaButtons.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('Escape key toggles pause on/off', async ({ page }) => {
    // Open pause
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();

    // Close pause with Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).not.toBeVisible();

    // Open again
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();
  });
});

test.describe('Victory Screen', () => {
  test('match with killLimit=2 eventually shows victory screen', async ({ page }) => {
    test.setTimeout(60000);
    // Low kill limit so bots finish fast
    await page.goto('/?arena=meadow&bots=2&killLimit=2');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });

    // Wait for bots to get enough kills — victory screen appears after match ends + 1.5s delay
    await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 55000 });
  });

  test('victory screen shows rematch button', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?arena=meadow&bots=2&killLimit=2');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 55000 });

    await expect(page.getByTestId('rematch-button')).toBeVisible();
  });

  test('victory screen shows menu button', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?arena=meadow&bots=2&killLimit=2');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 55000 });

    await expect(page.getByTestId('menu-button')).toBeVisible();
  });

  test('menu button returns to main menu', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?arena=meadow&bots=2&killLimit=2');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 55000 });

    await page.getByTestId('menu-button').click();
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 5000 });
  });

  test('match with timeLimit=8 shows victory screen after time expires', async ({ page }) => {
    test.setTimeout(30000);
    // 8-second time limit, high kill limit so time runs out first
    await page.goto('/?arena=meadow&bots=2&killLimit=99&timeLimit=8');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });

    // ~3s countdown + 8s match + 1.5s victory delay = ~12.5s, give buffer
    await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Time Limit', () => {
  test('timeLimit=10 match ends within ~15 seconds', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/?arena=meadow&bots=2&killLimit=99&timeLimit=10');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });

    // ~3s countdown + 10s match + 1.5s victory delay = ~14.5s
    await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 20000 });
  });

  test('victory screen appears after time limit with scores', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/?arena=meadow&bots=2&killLimit=99&timeLimit=10');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 20000 });

    // Victory screen should show scoreboard with player entries
    const scoreRows = page.locator('.score-row');
    const count = await scoreRows.count();
    // 1 human (P1) + 2 bots = 3 players
    expect(count).toBe(3);
  });
});
