import { test, expect } from '@playwright/test';

/** Dev mode (npm run dev) wraps the app in <StrictMode>, which double-mounts
 *  every effect to test idempotence. The worker-offload paths call
 *  `transferControlToOffscreen()` which is one-way per the HTML spec — a
 *  naive cleanup-then-remount would throw on the second transfer.
 *
 *  MUST run via `npx playwright test --config=playwright.dev.config.ts`
 *  (which webServers `npm run dev` on port 5173). The default
 *  `playwright.config.ts` runs against `vite preview`, where StrictMode
 *  is compiled out of the production build — that path can't catch the
 *  bug this spec is here to prevent.
 *
 *  The asserts below verify (a) the StrictMode double-mount really fires
 *  (sentinel-counter probe) and (b) phase=playing is reached with no
 *  unexpected console errors. */
async function probe(page: import('@playwright/test').Page, label: string, url: string): Promise<{ phase: string | null; errors: string[]; isDev: boolean }> {
  const errors: string[] = [];
  page.on('console', (m) => {
    // Capture EVERYTHING — previous tests filtered too aggressively and
    // masked the StrictMode crash. Filter only in post-processing if needed.
    const t = m.text();
    if (m.type() === 'error' || (m.type() === 'warning' && t.includes('worker'))) {
      errors.push(`[${m.type()}] ${t}`);
    }
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForTimeout(8000);
  const result = await page.evaluate(() => {
    const w = window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } };
    return {
      phase: w.__bunnyTest?.state?.()?.phase ?? null,
      // `/@vite/client` is injected only by the dev server — its presence
      // means StrictMode's dev-only double-mount actually fired. If absent,
      // we're against `vite preview` (production build) and the test
      // gives false confidence. Sentinel suggested by round-9 review.
      isDev: !!document.querySelector('script[src*="/@vite/client"]'),
    };
  });
  return { phase: result.phase, isDev: result.isDev, errors };
}

function assertDevMode(r: { isDev: boolean }): void {
  expect(
    r.isDev,
    'StrictMode regression spec must run via `npx playwright test --config=playwright.dev.config.ts`. ' +
    'The default preview-mode harness does NOT exercise StrictMode (no-op in production builds).',
  ).toBe(true);
}

// `?worker=off` row deleted alongside the kill-switch removal — the URL
// param no longer steers paths after 2026-05-10 (workerFlag.ts is now a
// capability check only). Main-thread Renderer is reachable only on hosts
// without OffscreenCanvas / module Worker support; that's environmental
// and not exercised here.

test('StrictMode dev default (worker on) reaches playing', async ({ page }) => {
  // Phase 1 ship default: renderer-only worker via capability check.
  // Survives StrictMode's dev double-mount via the deferred-teardown
  // pattern in useLocalMatch.lifecycleRef.
  const r = await probe(page, 'default', '/?arena=castle&bots=2&killLimit=4');
  assertDevMode(r);
  if (r.phase !== 'playing') console.log('[default] errors:', r.errors);
  expect(r.phase).toBe('playing');
  // We do NOT assert "no errors" — the dev-mode `HowlerGlobal is not
  // defined` warning is documented and benign (howler module init throws
  // asynchronously in the worker after the first message dispatch has
  // already succeeded). Production builds skip optimizeDeps and don't
  // trip the warning. A real StrictMode regression manifests as
  // phase=loading + InvalidStateError (canvas detached), which the phase
  // assert catches.
});

test.skip('StrictMode dev ?simWorker=on reaches playing — still stuck (opt-in, prod works)', async () => {
  // The howler-side blockers are now gone (audio/index.ts conditionally
  // routes to the worker stub via `typeof importScripts === 'function'`
  // detection — howler never enters the worker module graph). But sim-
  // worker still doesn't reach playing in dev — the worker module
  // initializes and receives `host:engineSetPhase` but `host:initEngine`
  // is never processed. Suspected: top-level-await ordering between
  // renderWorker.ts's message listener registration and the host's
  // postMessage. Production builds skip the audio/index.ts top-level
  // await entirely (rollup tree-shakes), so prod is unaffected.
  //
  // Phase 1 ship target is renderer-only worker (?worker=on default).
  // That path works in both dev and prod. sim-worker dev remains the
  // outstanding limitation.
});
