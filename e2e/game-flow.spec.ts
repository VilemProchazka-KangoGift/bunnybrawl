import { test, expect } from '@playwright/test';
import type { BunnyTestSnapshot } from '../src/components/bunnyTestShim';

test.describe('Carrot Royale E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows main menu on load', async ({ page }) => {
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('main-menu').getByAltText('Carrot Royale')).toBeVisible();
    await expect(page.getByTestId('play-button')).toBeVisible();
    await expect(page.getByTestId('arena-selector').locator('.arena-btn')).toHaveCount(12);
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

  test('gore toggle exists in settings', async ({ page }) => {
    await page.locator('.settings-toggle-btn').click();
    await expect(page.getByTestId('gore-toggle')).toBeVisible();
  });
});

for (const mode of ['default', 'simWorker=off']) {
  test(`lobby opens before match packs and match waits for them (${mode})`, async ({ page }) => {
    let releasePacks!: () => void;
    const packsReleased = new Promise<void>(resolve => { releasePacks = resolve; });
    let markRequested!: () => void;
    const packsRequested = new Promise<void>(resolve => { markRequested = resolve; });
    // Delay the real production pack chunks to exercise the preload/start race.
    await page.route('**/assets/builtin-*.js', async route => {
      markRequested();
      await packsReleased;
      await route.continue();
    });

    try {
      await page.goto(mode === 'default' ? '/' : '?simWorker=off');
      await page.getByTestId('play-button').click();
      await expect(page.getByTestId('char-select')).toBeVisible();
      await packsRequested;

      // The diagnostic store bypasses walking to START; this test targets asset readiness.
      await page.evaluate(() => {
        const shim = (window as Window & { __bunnyTest?: BunnyTestSnapshot }).__bunnyTest;
        const store = shim?.gameStore()?.getState();
        if (!store) throw new Error('Missing diagnostic store');
        store.setActivePlayers(['P1', 'P2']);
        store.setMatchSettings({ arenaId: 'meadow', botCount: 0, playerCount: 2 });
        store.setScreen('match');
      });
      await expect(page.locator('.screen-loading')).toBeVisible();
      await expect(page.getByTestId('match-screen')).toHaveCount(0);
      releasePacks();

      await expect(page.getByTestId('match-screen')).toBeVisible();
      await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing');
      await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
    } finally {
      releasePacks();
    }
  });
}
