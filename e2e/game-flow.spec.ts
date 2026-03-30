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

  test('players can walk right into ready zone and start match', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();

    // Hold right keys for P1 and P2 to walk into ready zone
    // P1 walks right with 'd', P2 walks right with 'ArrowRight'
    await page.keyboard.down('d');
    await page.keyboard.down('ArrowRight');

    // Wait for them to walk into the zone and countdown to finish
    // Countdown is 5 seconds, plus walk time
    await page.waitForTimeout(8000);

    // Should transition to match
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('game-canvas')).toBeVisible();
  });

  test('match canvas has correct size', async ({ page }) => {
    await page.getByTestId('play-button').click();

    // Walk P1 and P2 into zone
    await page.keyboard.down('d');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(8000);

    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 5000 });
    const canvas = page.getByTestId('game-canvas');
    await expect(canvas).toHaveAttribute('width', '1280');
    await expect(canvas).toHaveAttribute('height', '720');
  });
});
