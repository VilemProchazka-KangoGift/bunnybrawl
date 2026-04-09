import { test, expect } from '@playwright/test';

test.describe('Mobile support (@mobile)', () => {
  test.beforeEach(async ({ page }) => {
    // ?mobile forces isTouchPrimary() = true even on desktop browsers
    await page.goto('/?mobile');
  });

  test('adds .is-mobile class to html element', async ({ page }) => {
    await expect(page.locator('html.is-mobile')).toBeAttached();
  });

  test('hides fullscreen button on mobile', async ({ page }) => {
    await expect(page.locator('.fullscreen-btn')).toBeHidden();
  });

  test('hides keyboard controls hint on menu', async ({ page }) => {
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.locator('.controls-hint')).toBeHidden();
  });

  test('enforces minimum 1 bot on mobile', async ({ page }) => {
    await expect(page.getByTestId('main-menu')).toBeVisible();
    const botCount = page.getByTestId('bot-count');
    await expect(botCount).toHaveText(/[1-5]/);
    // Minus button should be disabled at 1
    const minusBtn = page.locator('.bot-btn').first();
    // Click minus until it stops
    for (let i = 0; i < 6; i++) {
      if (await minusBtn.isDisabled()) break;
      await minusBtn.click();
    }
    await expect(botCount).toHaveText('1');
    await expect(minusBtn).toBeDisabled();
  });

  test('lobby loads without crash on mobile', async ({ page }) => {
    // Set 2 bots for a quicker match
    const plusBtn = page.locator('.bot-btn').last();
    await plusBtn.click();
    await plusBtn.click();

    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toBeVisible();
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();

    // Canvas should be rendering (not crashed) — wait a moment then check it's still visible
    await page.waitForTimeout(500);
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();
  });

  test('lobby shows back button on mobile', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toBeVisible();
    await expect(page.locator('.lobby-back-btn')).toBeVisible();
  });

  test('lobby back button returns to menu', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toBeVisible();
    await page.locator('.lobby-back-btn').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  test('match shows pause button on mobile', async ({ page }) => {
    // Skip lobby via URL params
    await page.goto('/?mobile&arena=meadow&bots=1&killLimit=16');
    await expect(page.getByTestId('match-screen')).toBeVisible();
    await expect(page.getByTestId('mobile-pause-btn')).toBeVisible();
  });

  test('mobile pause button opens pause menu', async ({ page }) => {
    await page.goto('/?mobile&arena=meadow&bots=1&killLimit=16');
    await expect(page.getByTestId('match-screen')).toBeVisible();

    await page.getByTestId('mobile-pause-btn').click();
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await expect(page.getByTestId('resume-button')).toBeVisible();
  });

  test('touch overlay renders in match on mobile', async ({ page }) => {
    await page.goto('/?mobile&arena=meadow&bots=1&killLimit=16');
    await expect(page.getByTestId('match-screen')).toBeVisible();
    await expect(page.locator('.touch-overlay')).toBeVisible();
  });

  test('victory screen uses single-column layout on mobile', async ({ page }) => {
    // Quick match: 1 kill limit, wait for match to end
    await page.goto('/?mobile&arena=meadow&bots=1&killLimit=1&timeLimit=10');
    // Wait for victory screen (bots will fight, match ends by timeout at worst)
    await expect(page.getByTestId('victory-screen')).toBeVisible({ timeout: 30000 });
    // Check that victory-columns has single-column flex direction via .is-mobile rule
    const columns = page.locator('.victory-columns');
    await expect(columns).toHaveCSS('flex-direction', 'column');
  });

  test('pause arena grid uses 3 columns on mobile', async ({ page }) => {
    await page.goto('/?mobile&arena=meadow&bots=1&killLimit=16');
    await expect(page.getByTestId('match-screen')).toBeVisible();

    await page.getByTestId('mobile-pause-btn').click();
    await expect(page.getByTestId('pause-menu')).toBeVisible();

    // Open level select
    await page.locator('.level-btn').click();
    const grid = page.locator('.pause-arena-grid');
    await expect(grid).toBeVisible();
    // Computed value is resolved pixel widths, not the CSS repeat() — just check 3 values exist
    const cols = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns);
    const colCount = cols.split(/\s+/).length;
    expect(colCount).toBe(3);
  });
});

test.describe('Desktop regression (@desktop)', () => {
  test('no mobile UI on desktop (no ?mobile param)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html.is-mobile')).not.toBeAttached();
    await expect(page.locator('.fullscreen-btn')).toBeVisible();
    await expect(page.locator('.controls-hint')).toBeVisible();
  });

  test('lobby loads normally on desktop', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();
    // No back button on desktop
    await expect(page.locator('.lobby-back-btn')).not.toBeVisible();
  });

  test('no pause button or touch overlay on desktop match', async ({ page }) => {
    await page.goto('/?arena=meadow&bots=1&killLimit=16');
    await expect(page.getByTestId('match-screen')).toBeVisible();
    await expect(page.locator('.mobile-pause-btn')).not.toBeVisible();
    await expect(page.locator('.touch-overlay')).not.toBeAttached();
  });
});
