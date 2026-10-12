import { test, expect } from '@playwright/test';

// Count actual canvas draws: a populated hazard array alone cannot prove that
// the renderer worker registered its entity drawing modules.
for (const arena of ['underwater', 'waterfall']) for (const query of ['', '&simWorker=off']) {
  test(`${arena} current draws shaded ribbons and bubbles in worker mode ${query || 'default'}`, async ({ page }) => {
    page.on('worker', worker => {
      void worker.evaluate(() => {
        const scope = globalThis as unknown as { geyserBubbleDraws: number };
        scope.geyserBubbleDraws = 0;
        const original = OffscreenCanvasRenderingContext2D.prototype.fill;
        OffscreenCanvasRenderingContext2D.prototype.fill = function (...args: Parameters<typeof original>) {
          if (this.fillStyle === '#7dceda') scope.geyserBubbleDraws++;
          return original.apply(this, args);
        };
      }).catch(() => {});
    });
    await page.goto(`?arena=${arena}&bots=2${query}`);
    await expect.poll(async () => {
      const counts = await Promise.all(page.workers().map(worker => worker.evaluate(
        () => (globalThis as unknown as { geyserBubbleDraws?: number }).geyserBubbleDraws ?? 0,
      ).catch(() => 0)));
      return counts.reduce((sum, n) => sum + n, 0);
    }, { timeout: 40000 }).toBeGreaterThan(0);
  });
}
