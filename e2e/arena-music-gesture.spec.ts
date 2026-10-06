import { expect, test } from '@playwright/test';

test('direct arena entry retries blocked music on the first movement key', async ({ page }) => {
  await page.addInitScript(() => {
    const nativePlay = HTMLMediaElement.prototype.play;
    let activated = false;
    const attempts: string[] = [];
    Object.assign(window, { __musicAttempts: attempts });
    window.addEventListener('keydown', () => { activated = true; }, { capture: true });
    HTMLMediaElement.prototype.play = function () {
      if (this.currentSrc.includes('meadow.mp3') || this.src.includes('meadow.mp3')) {
        attempts.push(activated ? 'gesture' : 'blocked');
        if (!activated) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
      }
      return nativePlay.call(this);
    };
  });
  await page.goto('?arena=meadow&bots=1&pocketBunny=1');
  await expect.poll(() => page.evaluate(() => window.__bunnyTest?.state()?.phase)).toBe('playing');
  await expect.poll(() => page.evaluate(() => (window as any).__musicAttempts?.includes('blocked'))).toBe(true);
  await page.keyboard.press('KeyD');
  await expect.poll(() => page.evaluate(() => (window as any).__musicAttempts?.includes('gesture'))).toBe(true);
  const gestures = await page.evaluate(() => (window as any).__musicAttempts.filter((x: string) => x === 'gesture').length);
  await page.keyboard.press('KeyD');
  expect(await page.evaluate(() => (window as any).__musicAttempts.filter((x: string) => x === 'gesture').length)).toBe(gestures);
});
