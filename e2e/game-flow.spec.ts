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

  test('navigates from menu to character select', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toBeVisible();
    await expect(page.getByText('Choose Your Fighter!')).toBeVisible();
  });

  test('shows all 4 player slots in character select', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('slot-P1')).toBeVisible();
    await expect(page.getByTestId('slot-P2')).toBeVisible();
    await expect(page.getByTestId('slot-P3')).toBeVisible();
    await expect(page.getByTestId('slot-P4')).toBeVisible();
  });

  test('start button disabled until 2 players ready', async ({ page }) => {
    await page.getByTestId('play-button').click();
    const startBtn = page.getByTestId('start-button');
    await expect(startBtn).toBeDisabled();
    await expect(startBtn).toHaveText('Need 2+ Players');
  });

  test('players can ready up and start match', async ({ page }) => {
    await page.getByTestId('play-button').click();

    // P1 ready (W key)
    await page.keyboard.press('w');
    // P2 ready (ArrowUp)
    await page.keyboard.press('ArrowUp');

    const startBtn = page.getByTestId('start-button');
    await expect(startBtn).not.toBeDisabled();
    await expect(startBtn).toHaveText('Start Match!');
  });

  test('full flow: menu → select → match → starts', async ({ page }) => {
    // Navigate to character select
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toBeVisible();

    // Ready up P1 and P2
    await page.keyboard.press('w');
    await page.keyboard.press('ArrowUp');

    // Start match
    await page.getByTestId('start-button').click();

    // Match screen should appear with canvas
    await expect(page.getByTestId('match-screen')).toBeVisible();
    await expect(page.getByTestId('game-canvas')).toBeVisible();
  });

  test('can go back from character select to menu', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toBeVisible();

    await page.getByTestId('back-button').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  test('escape key returns to menu from character select', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  test('kill limit can be changed', async ({ page }) => {
    await page.getByTestId('play-button').click();
    const killLimit = page.getByTestId('kill-limit');
    await killLimit.selectOption('5');
    await expect(killLimit).toHaveValue('5');
  });

  test('time limit can be changed', async ({ page }) => {
    await page.getByTestId('play-button').click();
    const timeLimit = page.getByTestId('time-limit');
    await timeLimit.selectOption('60');
    await expect(timeLimit).toHaveValue('60');
  });

  test('match canvas has correct size', async ({ page }) => {
    await page.getByTestId('play-button').click();
    await page.keyboard.press('w');
    await page.keyboard.press('ArrowUp');
    await page.getByTestId('start-button').click();

    const canvas = page.getByTestId('game-canvas');
    await expect(canvas).toHaveAttribute('width', '1280');
    await expect(canvas).toHaveAttribute('height', '720');
  });

  test('3 players can ready up', async ({ page }) => {
    await page.getByTestId('play-button').click();

    await page.keyboard.press('w');       // P1
    await page.keyboard.press('ArrowUp'); // P2
    await page.keyboard.press('i');       // P3

    const startBtn = page.getByTestId('start-button');
    await expect(startBtn).not.toBeDisabled();
  });

  test('4 players can ready up', async ({ page }) => {
    await page.getByTestId('play-button').click();

    await page.keyboard.press('w');       // P1
    await page.keyboard.press('ArrowUp'); // P2
    await page.keyboard.press('i');       // P3
    await page.keyboard.press('t');       // P4

    const startBtn = page.getByTestId('start-button');
    await expect(startBtn).not.toBeDisabled();
  });

  test('player can unready by pressing jump again', async ({ page }) => {
    await page.getByTestId('play-button').click();

    // P1 ready, P2 ready
    await page.keyboard.press('w');
    await page.keyboard.press('ArrowUp');

    // P2 unready
    await page.keyboard.press('ArrowUp');

    const startBtn = page.getByTestId('start-button');
    await expect(startBtn).toBeDisabled();
  });
});
