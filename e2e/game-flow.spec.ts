import { test, expect } from '@playwright/test';

test.describe('BunnyBrawl E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows main menu on load', async ({ page }) => {
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByText('Bunny')).toBeVisible();
    await expect(page.getByText('Brawl')).toBeVisible();
    await expect(page.getByTestId('play-button')).toBeVisible();
  });

  test('navigates from menu to lobby', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toBeVisible();
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();
  });

  test('lobby canvas has correct dimensions', async ({ page }) => {
    await page.getByTestId('play-button').click();
    const canvas = page.getByTestId('lobby-canvas');
    await expect(canvas).toHaveAttribute('width', '1280');
    await expect(canvas).toHaveAttribute('height', '720');
  });

  test('escape key returns to menu from lobby', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  test('players can reach ready zone and start match', async ({ page }) => {
    test.setTimeout(40000);
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();

    // Hold right + repeatedly jump to get over the wall
    await page.keyboard.down('d');
    await page.keyboard.down('ArrowRight');

    // Spam jump keys to get over wall
    const jumpLoop = async () => {
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('w');
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(500);
      }
    };
    jumpLoop(); // fire and forget

    // Wait for match to start (walk + wall jump + countdown)
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 25000 });
    await expect(page.getByTestId('game-canvas')).toBeVisible();
  });

  test('gore toggle exists on menu', async ({ page }) => {
    await expect(page.getByTestId('gore-toggle')).toBeVisible();
  });
});
