import { test, expect } from '@playwright/test';
import type { BunnyTestSnapshot } from '../src/components/bunnyTestShim';

type Controls = { hold(): void; resume(): void };
declare global {
  interface Window {
    __inputRafControl: Controls;
    __inputProbeSample: Promise<{ consumedAt: number; renderedAt: number } | null>;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    let held = false;
    let pending: FrameRequestCallback[] = [];
    window.requestAnimationFrame = callback => raf(time => {
      if (held) pending.push(callback); else callback(time);
    });
    window.__inputRafControl = {
      hold() { held = true; },
      resume() {
        held = false;
        const callbacks = pending; pending = [];
        for (const callback of callbacks) raf(callback);
      },
    };
  });
});

for (const delivery of ['sab', 'messages']) {
  for (const button of ['right', 'jump'] as const) {
    test('worker consumes ' + button + ' without a main RAF (' + delivery + ')', async ({ page }) => {
      if (delivery === 'messages') {
        await page.addInitScript(() => Object.defineProperty(window, 'crossOriginIsolated', { value: false }));
      }
      await page.goto('?arena=meadow&bots=0&debug=perf');
      await page.waitForFunction(() => window.__bunnyTest?.state()?.countdown === 0);
      await page.evaluate(async ({ button, delivery }) => {
        const proxy = (window.__bunnyTest as BunnyTestSnapshot).gameLoop() as unknown as {
          worker: Worker; inputSabView: Int32Array | null; isRemoteSim(): boolean;
        };
        if (!proxy.isRemoteSim() || Boolean(proxy.inputSabView) !== (delivery === 'sab')) throw new Error('Wrong worker/delivery mode');
        let resolveSample!: (sample: { consumedAt: number; renderedAt: number } | null) => void;
        window.__inputProbeSample = new Promise(resolve => { resolveSample = resolve; });
        await new Promise<void>(resolveArmed => {
          const listener = (event: MessageEvent) => {
            const message = event.data;
            if (message?.type !== 'worker:inputProbe' || message.id !== 1) return;
            if (message.armed) resolveArmed();
            else { clearTimeout(timer); proxy.worker.removeEventListener('message', listener); resolveSample(message); }
          };
          const timer = setTimeout(() => { proxy.worker.removeEventListener('message', listener); resolveSample(null); }, 2000);
          proxy.worker.addEventListener('message', listener);
          proxy.worker.postMessage({ type: 'host:inputProbe', id: 1, slot: 'P1', button, pressed: true });
        });
        window.__inputRafControl.hold();
      }, { button, delivery });
      try {
        const key = button === 'right' ? 'd' : 'w';
        await page.keyboard.down(key);
        // Complete the jump tap before the main input pump can run again.
        if (button === 'jump') await page.keyboard.up(key);
        const sample = await page.evaluate(() => window.__inputProbeSample);
        expect(sample, 'input must reach a simulation tick even while main RAF is held').not.toBeNull();
        expect(sample!.renderedAt).toBeGreaterThanOrEqual(sample!.consumedAt);
        await page.keyboard.up(key);
      } finally { await page.evaluate(() => window.__inputRafControl.resume()); }
    });
  }
}

test('main-thread simulation retains a complete jump tap between frames', async ({ page }) => {
  await page.goto('?arena=meadow&bots=0&simWorker=off');
  await page.waitForFunction(() => {
    const state = window.__bunnyTest?.state();
    return state?.countdown === 0 && state.timeElapsed > 4 && state.players[0].state === 'idle';
  });
  await page.evaluate(() => window.__inputRafControl.hold());
  await page.keyboard.down('w');
  await page.keyboard.up('w');
  await page.evaluate(() => window.__inputRafControl.resume());
  await page.waitForFunction(() => {
    const player = window.__bunnyTest?.state()?.players[0];
    return player?.state === 'airborne' && player.vy < 0;
  }, undefined, { timeout: 2000 });
});
