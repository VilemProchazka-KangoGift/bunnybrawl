import { test, expect } from '@playwright/test';

test.describe('Arena Selector', () => {
  test('arena selector is visible on main menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('arena-selector')).toBeVisible();
  });

  test('clicking an arena changes the selection', async ({ page }) => {
    await page.goto('/');
    const selector = page.getByTestId('arena-selector');
    await expect(selector).toBeVisible();

    // Click the volcano arena button (arena-btn with text containing the arena icon/name)
    const volcanoBtn = selector.locator('.arena-btn').nth(2); // volcano is 3rd arena
    await volcanoBtn.click();
    await expect(volcanoBtn).toHaveClass(/selected/);

    // Click a different arena (meadow, 1st)
    const meadowBtn = selector.locator('.arena-btn').nth(0);
    await meadowBtn.click();
    await expect(meadowBtn).toHaveClass(/selected/);
    // Volcano should no longer be selected
    await expect(volcanoBtn).not.toHaveClass(/selected/);
  });

  test('arena selection persists in localStorage', async ({ page }) => {
    await page.goto('/');
    const selector = page.getByTestId('arena-selector');

    // Click volcano (3rd arena)
    const volcanoBtn = selector.locator('.arena-btn').nth(2);
    await volcanoBtn.click();

    // Check localStorage
    const stored = await page.evaluate(() => localStorage.getItem('carrotroyale_arena'));
    expect(stored).toBe('volcano');
  });
});

test.describe('Gore Toggle', () => {
  test('gore toggle can be clicked to toggle state', async ({ page }) => {
    await page.goto('/');
    await page.locator('.settings-toggle-btn').click();
    const toggle = page.getByTestId('gore-toggle');
    await expect(toggle).toBeVisible();

    // Get initial state
    const initialChecked = await toggle.isChecked();

    // Click to toggle
    await toggle.click();
    const afterClick = await toggle.isChecked();
    expect(afterClick).toBe(!initialChecked);

    // Click again to toggle back
    await toggle.click();
    const afterSecondClick = await toggle.isChecked();
    expect(afterSecondClick).toBe(initialChecked);
  });

  test('gore setting persists in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.locator('.settings-toggle-btn').click();
    const toggle = page.getByTestId('gore-toggle');

    // Enable gore
    const isChecked = await toggle.isChecked();
    if (!isChecked) await toggle.click();
    expect(await page.evaluate(() => localStorage.getItem('carrotroyale_gore'))).toBe('true');

    // Disable gore
    await toggle.click();
    expect(await page.evaluate(() => localStorage.getItem('carrotroyale_gore'))).toBe('false');
  });
});

test.describe('Bot Difficulty Selection', () => {
  test('clicking Hard selects it and persists in localStorage', async ({ page }) => {
    await page.goto('/');
    const botSettings = page.getByTestId('bot-settings');
    const plusBtn = botSettings.getByRole('button', { name: '+' });

    // Add a bot so difficulty row appears
    await plusBtn.click();
    await expect(page.locator('.bot-difficulty-row')).toBeVisible();

    // Click Hard difficulty button (3rd of 4: easy, medium, hard, impossible)
    const hardBtn = page.locator('.difficulty-btn').nth(2);
    await hardBtn.click();
    await expect(hardBtn).toHaveClass(/selected/);

    // Check localStorage
    const stored = await page.evaluate(() => localStorage.getItem('carrotroyale_botdiff'));
    expect(stored).toBe('hard');
  });

  test('difficulty selector only appears when bots > 0', async ({ page }) => {
    await page.goto('/');
    // Clear any stored bot count
    await page.evaluate(() => localStorage.removeItem('carrotroyale_botcount'));
    await page.reload();

    await expect(page.locator('.bot-difficulty-row')).not.toBeVisible();

    const plusBtn = page.getByTestId('bot-settings').getByRole('button', { name: '+' });
    await plusBtn.click();
    await expect(page.locator('.bot-difficulty-row')).toBeVisible();
  });
});

test.describe('URL Params', () => {
  test('arena + bots + killLimit skips lobby and starts match', async ({ page }) => {
    await page.goto('/?arena=volcano&bots=2&killLimit=4');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('game-canvas')).toBeVisible();
    // Main menu should NOT be visible
    await expect(page.getByTestId('main-menu')).not.toBeVisible();
  });

  test('arena=rooftops starts match on rooftops', async ({ page }) => {
    await page.goto('/?arena=rooftops&bots=1');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('game-canvas')).toBeVisible();

    // Verify the arena was set in match settings via the store
    const arenaId = await page.evaluate(() => {
      const store = window.__bunnyTest?.gameStore();
      if (store) return store.getState().matchSettings.arenaId;
      // Fallback: check localStorage (set by setMatchSettings)
      return localStorage.getItem('carrotroyale_arena');
    });
    expect(arenaId).toBe('rooftops');
  });

  test('difficulty=hard starts with hard bots', async ({ page }) => {
    await page.goto('/?arena=meadow&bots=2&difficulty=hard');
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });

    // Verify difficulty was applied
    const difficulty = await page.evaluate(() => {
      const store = window.__bunnyTest?.gameStore();
      if (store) return store.getState().matchSettings.botDifficulty;
      return localStorage.getItem('carrotroyale_botdiff');
    });
    expect(difficulty).toBe('hard');
  });
});
