import { test, expect } from '@playwright/test';
import type { BunnyTestSnapshot } from '../src/components/bunnyTestShim';

for (const mode of ['default', 'simWorker=off']) {
  test('fresh Down immediately reverses a rising jump (' + mode + ')', async ({ page }) => {
    await page.goto('?arena=meadow&bots=0' + (mode === 'default' ? '' : '&simWorker=off'));
    await page.waitForFunction(() => {
      const state = window.__bunnyTest?.state();
      return state?.phase === 'playing' && state.countdown === 0
        && state.players.find(p => p.id === 'P1')?.state === 'idle';
    });
    const countdownEnd = await page.evaluate(() => window.__bunnyTest!.state()!.timeElapsed);
    await page.waitForFunction((time) => {
      const state = window.__bunnyTest?.state();
      return state && state.timeElapsed > time + 0.5
        && state.players.find(p => p.id === 'P1')?.state === 'idle';
    }, countdownEnd);
    const result = await page.evaluate(async (workerMode) => {
      const shim = window.__bunnyTest as BunnyTestSnapshot;
      const self = () => shim.state()!.players.find(p => p.id === 'P1')!;
      const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
      const key = (type: string, name: string) => window.dispatchEvent(new KeyboardEvent(type, { key: name }));
      // Worker diagnostics mirror at 1Hz. Align the jump near the next mirror
      // so that it captures the initial dive, rather than a later landing.
      if (workerMode) {
        const previousTime = shim.state()!.timeElapsed;
        while (shim.state()!.timeElapsed === previousTime) await nextFrame();
        await delay(740);
      }
      const grounded = self().state !== 'airborne';
      key('keydown', 'w');
      await delay(200);
      key('keyup', 'w');
      const before = workerMode ? undefined : self().vy;
      const previousTime = shim.state()!.timeElapsed;
      key('keydown', 's');
      try {
        if (workerMode) {
          while (shim.state()!.timeElapsed === previousTime) await nextFrame();
        } else {
          await delay(50);
        }
        return { workerActive: Boolean((window as Window & { __engineWorkerProxy?: unknown }).__engineWorkerProxy), grounded, before, vy: self().vy, fastFalling: self().fastFalling };
      } finally {
        key('keyup', 's');
      }
    }, mode === 'default');
    expect(result.workerActive).toBe(mode === 'default');
    expect(result.grounded).toBe(true);
    if (result.before !== undefined) expect(result.before).toBeLessThan(0);
    expect(result.fastFalling).toBe(true);
    expect(result.vy).toBeGreaterThanOrEqual(500);
  });
}
