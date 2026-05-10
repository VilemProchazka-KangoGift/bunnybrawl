import { test, expect } from '@playwright/test';

/** SAB hello-world smoke test — Step 1 of the SAB exploration roadmap.
 *
 *  Verifies the COOP/COEP foundation works in dev: `crossOriginIsolated`
 *  is true, `SharedArrayBuffer` is defined, and the demo worker shares an
 *  Int32Array view with main via Atomics. Asserts the 1-second summary
 *  log shows both sides advanced their counters.
 *
 *  MUST run via the dev config (it boots `npm run dev` with COOP/COEP
 *  headers). The default preview config also serves the headers, but
 *  dev is the development feedback loop. */
test('sabDemo: main + worker tick a shared Int32Array via Atomics', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'info' || m.type() === 'log' || m.type() === 'warning') {
      logs.push(m.text());
    }
  });
  await page.goto('/?sabDemo=1');
  await page.waitForTimeout(2500);

  // Sentinel from main.tsx boot log
  const bootLine = logs.find((l) => l.startsWith('[boot] crossOriginIsolated='));
  expect(bootLine, 'boot log missing — main.tsx instrumentation regression').toBeTruthy();
  expect(bootLine).toContain('crossOriginIsolated=true');
  expect(bootLine).toContain('SharedArrayBuffer=true');

  const sabSummary = logs.find((l) => l.startsWith('[sabDemo] 1s elapsed'));
  expect(sabSummary, `sabDemo summary missing. all logs:\n${logs.join('\n')}`).toBeTruthy();
  // Format: "[sabDemo] 1s elapsed — main=N ticks, worker=M ticks (shared via Atomics)"
  const m = sabSummary!.match(/main=(\d+) ticks, worker=(\d+) ticks/);
  expect(m, `unexpected summary format: ${sabSummary}`).toBeTruthy();
  const mainTicks = Number(m![1]);
  const workerTicks = Number(m![2]);
  // 1 second of rAF on a headless run is at least ~40 ticks; worker on setTimeout(1000/60) similar
  expect(mainTicks).toBeGreaterThan(30);
  expect(workerTicks).toBeGreaterThan(30);
});
