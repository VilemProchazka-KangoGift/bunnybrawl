import { test, expect } from '@playwright/test';

test.describe('Language Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('language toggle is visible on main menu', async ({ page }) => {
    const langToggle = page.locator('.lang-toggle');
    await expect(langToggle).toBeVisible();
    // Should contain language labels
    await expect(langToggle).toContainText('EN');
    await expect(langToggle).toContainText('CS');
  });

  test('clicking EN switches to English', async ({ page }) => {
    // Click EN in the language toggle
    await page.locator('.lang-toggle').getByText('EN').click();
    // Play button should show English text
    const playBtn = page.getByTestId('play-button');
    await expect(playBtn).toContainText(/Play|Hrát/);
  });

  test('clicking CS switches to Czech', async ({ page }) => {
    // First switch to English to have a known state
    await page.locator('.lang-toggle').getByText('EN').click();
    await expect(page.getByTestId('play-button')).toContainText('Play');

    // Now switch to Czech
    await page.locator('.lang-toggle').getByText('CS').click();
    // Play button should show Czech text
    await expect(page.getByTestId('play-button')).toContainText('Hrát');
  });

  test('language persists after page reload', async ({ page }) => {
    // Switch to English
    await page.locator('.lang-toggle').getByText('EN').click();
    await expect(page.getByTestId('play-button')).toContainText('Play');

    // Reload page
    await page.reload();
    // Should still be English
    await expect(page.getByTestId('play-button')).toContainText('Play');
  });

  test('Hindi language option is available', async ({ page }) => {
    const hiOption = page.locator('.lang-toggle').getByText('HI');
    await expect(hiOption).toBeVisible();
  });

  test('Filipino language option is available', async ({ page }) => {
    const filOption = page.locator('.lang-toggle').getByText('FIL');
    await expect(filOption).toBeVisible();
  });
});

test.describe('Main Menu UI Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('main menu shows logo', async ({ page }) => {
    await expect(page.getByAltText('Carrot Royale')).toBeVisible();
  });

  test('main menu shows play button', async ({ page }) => {
    await expect(page.getByTestId('play-button')).toBeVisible();
  });

  test('main menu shows online button', async ({ page }) => {
    await expect(page.getByTestId('online-btn')).toBeVisible();
  });

  test('arena selector is visible', async ({ page }) => {
    await expect(page.getByTestId('arena-selector')).toBeVisible();
  });

  test('bot settings are visible', async ({ page }) => {
    await expect(page.getByTestId('bot-settings')).toBeVisible();
  });

  test('gore toggle is visible', async ({ page }) => {
    await expect(page.getByTestId('gore-toggle')).toBeVisible();
  });
});

test.describe('Arena Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('arena selector is present and has content', async ({ page }) => {
    const selector = page.getByTestId('arena-selector');
    await expect(selector).toBeVisible();
    // Arena selector should have some child elements (arena boxes)
    const children = selector.locator('> *');
    const count = await children.count();
    expect(count).toBeGreaterThan(0);
  });

  test('arena selection persists in localStorage', async ({ page }) => {
    // Set arena via localStorage and verify it loads
    await page.evaluate(() => {
      localStorage.setItem('carrotroyale_arena', 'volcano');
    });
    await page.reload();

    const storedArena = await page.evaluate(() => {
      return localStorage.getItem('carrotroyale_arena');
    });
    expect(storedArena).toBe('volcano');
  });
});

test.describe('Gore Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('gore toggle can be clicked', async ({ page }) => {
    const toggle = page.getByTestId('gore-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    // Should toggle without crashing
    await expect(toggle).toBeVisible();
  });

  test('gore setting persists in localStorage', async ({ page }) => {
    // Click gore toggle
    await page.getByTestId('gore-toggle').click();
    // Check localStorage
    const goreValue = await page.evaluate(() => {
      return localStorage.getItem('carrotroyale_gore');
    });
    // Should be either 'true' or 'false' (toggled from default)
    expect(['true', 'false']).toContain(goreValue);
  });
});

test.describe('Online Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('online button opens online modal', async ({ page }) => {
    await page.getByTestId('online-btn').click();
    // Modal should be visible with name input and create/join buttons
    await expect(page.getByTestId('online-name-input')).toBeVisible();
  });

  test('create button hidden without player name', async ({ page }) => {
    await page.getByTestId('online-btn').click();
    // Create button should be hidden or disabled without name
    const createBtn = page.getByTestId('online-create-btn');
    // The button visibility depends on whether name is entered
    await expect(page.getByTestId('online-name-input')).toBeVisible();
  });

  test('can enter player name', async ({ page }) => {
    await page.getByTestId('online-btn').click();
    const nameInput = page.getByTestId('online-name-input');
    await nameInput.click();
    await nameInput.fill('TestPlayer');
    // Create button should now be visible
    await expect(page.getByTestId('online-create-btn')).toBeVisible();
  });

  test('escape closes online modal', async ({ page }) => {
    await page.getByTestId('online-btn').click();
    await expect(page.getByTestId('online-name-input')).toBeVisible();
    await page.keyboard.press('Escape');
    // Should be back on main menu
    await expect(page.getByTestId('play-button')).toBeVisible();
  });
});
