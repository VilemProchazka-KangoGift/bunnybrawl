import { test, expect } from '@playwright/test';

/** Dev mode (npm run dev) wraps the app in <StrictMode>, which double-mounts
 *  every effect to test idempotence. The worker-offload paths call
 *  `transferControlToOffscreen()` which is one-way per the HTML spec — a
 *  naive cleanup-then-remount would throw on the second transfer.
 *  This spec catches regressions in the deferred-teardown workaround in
 *  `useLocalMatch.ts`. Run against `npm run dev` only (not preview). */
async function probe(page: import('@playwright/test').Page, label: string, url: string): Promise<{ phase: string | null; errors: string[] }> {
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
  const phase = await page.evaluate(() => {
    const w = window as unknown as { __bunnyTest?: { state?: () => { phase?: string } } };
    return w.__bunnyTest?.state?.()?.phase ?? null;
  });
  return { phase, errors };
}

for (const mode of ['off', 'on'] as const) {
  test(`StrictMode dev ?worker=${mode} reaches playing`, async ({ page }) => {
    const r = await probe(page, `worker=${mode}`, `/?arena=castle&bots=2&killLimit=4&worker=${mode}`);
    // If StrictMode handling is broken we'd see InvalidStateError in errors
    // and phase would be null/loading. Print full error list for diagnosis.
    if (r.phase !== 'playing') {
      console.log(`[worker=${mode}] errors:`, r.errors);
    }
    expect(r.phase).toBe('playing');
    // Detached-canvas errors would surface here. Allow ONLY the audio
    // ones we know are benign in headless Chrome.
    const fatal = r.errors.filter((e) => !e.includes('AudioContext') && !e.includes('HTML5 Audio pool'));
    expect(fatal, `unexpected errors: ${fatal.join('\n')}`).toEqual([]);
  });
}
test('StrictMode dev ?simWorker=on reaches playing', async ({ page }) => {
  const r = await probe(page, 'simWorker=on', '/?arena=castle&bots=2&killLimit=4&simWorker=on');
  if (r.phase !== 'playing') console.log('[simWorker=on] errors:', r.errors);
  expect(r.phase).toBe('playing');
  const fatal = r.errors.filter((e) => !e.includes('AudioContext') && !e.includes('HTML5 Audio pool'));
  expect(fatal, `unexpected errors: ${fatal.join('\n')}`).toEqual([]);
});
