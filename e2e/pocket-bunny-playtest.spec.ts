import { test, expect } from '@playwright/test';

for (const [mode, query] of [
  ['sim worker', '?arena=meadow&bots=1&pocketBunny=1'],
  ['renderer worker', '?arena=meadow&bots=1&pocketBunny=1&simWorker=off'],
] as const) {
  test(`Pocket Plush Bunny is playable with ${mode}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(query);
    await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 20000 });
    await page.waitForFunction(() => window.__bunnyTest?.state()?.phase === 'playing', undefined, { timeout: 20000 });
    await page.waitForFunction(() => (window.__bunnyTest?.state()?.timeElapsed ?? 0) > .5);

    const before = await page.evaluate(() => {
      const player = window.__bunnyTest?.state()?.players.find(p => p.id === 'P1');
      if (!player) throw new Error('P1 missing');
      return { x: player.x, name: player.character.name };
    });
    expect(before.name).toBe('Bunny');
    const key = before.x < 1000 ? 'd' : 'a';
    await page.keyboard.down(key);
    try {
      await expect.poll(async () => page.evaluate((startX) => {
        const x = window.__bunnyTest?.state()?.players.find(p => p.id === 'P1')?.x ?? startX;
        return Math.abs(x - startX) > 5;
      }, before.x)).toBe(true);
    } finally {
      await page.keyboard.up(key);
    }
    const screenshot = await page.screenshot({ path: testInfo.outputPath('pocket-bunny-in-game.png') });
    const sky = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 200, 150, 1, 1, 0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    }, screenshot.toString('base64'));
    expect(sky[2], 'Meadow sky should render before play begins').toBeGreaterThan(sky[0] + 30);
    expect(errors).toEqual([]);
  });
}
