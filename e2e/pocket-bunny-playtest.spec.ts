import { test, expect } from '@playwright/test';

for (const [mode, query] of [
  ['sim worker', '?arena=meadow&bots=1&pocketBunny=1'],
  ['renderer worker', '?arena=meadow&bots=1&pocketBunny=1&simWorker=off'],
] as const) {
  test(`Pocket Plush Bunny is playable with ${mode}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const atlasResponses: number[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().includes('pocket-bunny-game-atlas')) atlasResponses.push(response.status());
    });
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
    expect(atlasResponses).toContain(200);
    const key = before.x < 1000 ? 'd' : 'a';
    await page.keyboard.down('s');
    try {
      await expect.poll(() => page.evaluate(() => {
        const player = window.__bunnyTest?.state()?.players.find(p => p.id === 'P1');
        return !!player && player.state !== 'airborne' && player.squashScale <= .65;
      })).toBe(true);
      const crouchStartX = await page.evaluate(() => window.__bunnyTest?.state()?.players.find(p => p.id === 'P1')?.x ?? 0);
      await page.keyboard.down(key);
      try {
        await expect.poll(() => page.evaluate((startX) => {
          const player = window.__bunnyTest?.state()?.players.find(p => p.id === 'P1');
          return !!player && player.squashScale <= .65 && Math.abs(player.x - startX) > 5;
        }, crouchStartX)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('pocket-bunny-moving-crouch.png') });
      } finally {
        await page.keyboard.up(key);
      }
    } finally {
      await page.keyboard.up('s');
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
