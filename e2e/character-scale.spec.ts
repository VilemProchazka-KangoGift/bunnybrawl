import { test, expect } from '@playwright/test';
import type { BunnyTestSnapshot } from '../src/components/bunnyTestShim';
for (const scale of [1.25, 1.5]) {
  test(`lobby uses 1.5 scale with match preference ${scale}`, async ({ page }) => {
    await page.goto(`?characterScale=${scale}`);
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('char-select')).toHaveAttribute('data-character-scale', '1.5');
    await expect(page.getByTestId('lobby-canvas')).toBeVisible();
  });
  for (const worker of ['default', 'off']) {
    test(`scaled body survives arena change: ${scale} (${worker})`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`?arena=meadow&bots=2&killLimit=999&characterScale=${scale}${worker === 'off' ? '&simWorker=off' : ''}`);
      await page.waitForFunction(() => (window as unknown as { __bunnyTest: BunnyTestSnapshot }).__bunnyTest?.state()?.phase === 'playing');
      await page.waitForFunction(expected => {
        const w = window as unknown as { __engineWorkerProxy?: object; __rendererProxy?: object };
        return expected === 'default' ? !!w.__engineWorkerProxy : !!w.__rendererProxy && !w.__engineWorkerProxy;
      }, worker);
      const dimensions = () => page.evaluate(() => (window as unknown as { __bunnyTest: BunnyTestSnapshot }).__bunnyTest.state()!.players.map(p => [p.width, p.height]));
      expect(await dimensions()).toEqual([[32 * scale, 32 * scale], [32 * scale, 32 * scale], [32 * scale, 32 * scale]]);
      await page.keyboard.press('Escape');
      await page.locator('.level-btn').first().click();
      await page.locator('.pause-arena-btn:not(.current)').first().click();
      await page.waitForFunction(() => (window as unknown as { __bunnyTest: BunnyTestSnapshot }).__bunnyTest.state()?.phase === 'playing');
      await expect(page.locator('.match-loading-overlay')).toHaveCount(0);
      expect(await dimensions()).toEqual([[32 * scale, 32 * scale], [32 * scale, 32 * scale], [32 * scale, 32 * scale]]);
      expect(errors).toEqual([]);
    });
  }
}
