import { test, expect } from '@playwright/test';

test.describe('Carrot Royale E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows main menu on load', async ({ page }) => {
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByAltText('Carrot Royale')).toBeVisible();
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

  test('players can reach ready zone and start match', { tag: '@flaky' }, async ({ page }) => {
    test.setTimeout(50000);
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();

    // Hold right + spam jump to get over the wall and NPCs
    await page.keyboard.down('d');
    await page.keyboard.down('ArrowRight');

    // Aggressively jump + fast-fall to push through NPCs and over wall
    const jumpLoop = async () => {
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press('w');
        await page.keyboard.press('ArrowUp');
        // Alternate: fast-fall to stomp NPCs, then jump again
        if (i % 3 === 1) {
          await page.keyboard.press('s');
          await page.keyboard.press('ArrowDown');
        }
        await page.waitForTimeout(200);
      }
    };
    jumpLoop();

    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 40000 });
    await expect(page.getByTestId('game-canvas')).toBeVisible();
  });

  test('gore toggle exists on menu', async ({ page }) => {
    await expect(page.getByTestId('gore-toggle')).toBeVisible();
  });
});
