import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

interface LongTaskEntry {
  startTime: number;
  duration: number;
  name: string;
  attribution: { name: string; entryType: string; containerType?: string; containerName?: string }[];
}

declare global {
  interface Window {
    __longTasks?: LongTaskEntry[];
  }
}

test('perf profile run', async ({ page, context }) => {
  const arena = process.env.PERF_ARENA ?? 'rooftops';
  const bots = process.env.PERF_BOTS ?? '4';
  const difficulty = process.env.PERF_DIFFICULTY ?? 'hard';
  const durationS = Number(process.env.PERF_DURATION_S ?? '30');
  const outDir = process.env.PERF_OUT_DIR ?? path.join(process.cwd(), 'test-results', 'perf');
  // Random P1 input simulates a human player so the profile reflects realistic
  // gameplay (movement, jumps, sprite cache misses, push interactions) rather
  // than P1 standing still while bots play. Set PERF_INPUT=off to disable.
  const inputMode = process.env.PERF_INPUT ?? 'random';

  test.setTimeout((durationS + 60) * 1000);
  mkdirSync(outDir, { recursive: true });

  // Install in-page long-task observer BEFORE navigation
  await context.addInitScript(() => {
    const buf: LongTaskEntry[] = [];
    window.__longTasks = buf;
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & {
            attribution?: { name: string; entryType: string; containerType?: string; containerName?: string }[];
          };
          buf.push({
            startTime: e.startTime,
            duration: e.duration,
            name: e.name,
            attribution: e.attribution ?? [],
          });
        }
      });
      obs.observe({ entryTypes: ['longtask'] });
    } catch {
      // longtask not supported; skip silently
    }
  });

  // ?debug=perffps activates BOTH perfTrace AND fpsCounter (the substring matches both flags).
  // URL params encoded for defense — arena IDs are alphanumeric in practice but encoding
  // protects against injection if a malicious value reaches us via env vars.
  const url = `/?arena=${encodeURIComponent(arena)}`
    + `&bots=${encodeURIComponent(bots)}`
    + `&difficulty=${encodeURIComponent(difficulty)}`
    + `&killLimit=999&debug=perffps`
    + (process.env.PERF_EXTRA_URL ?? '');
  await page.goto(url);
  await page.waitForFunction(() => window.__gameLoop?.getState()?.countdown === 0, undefined, { timeout: 15000 });
  expect(await page.evaluate(() => window.__perfTrace?.enabled)).toBe(true);

  // Reset perfTrace so countdown samples don't pollute the run
  await page.evaluate(() => window.__perfTrace?.reset());

  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Performance.enable');

  // Wrap collection in try/finally so the profilers are always stopped, even
  // on test failure — otherwise they keep running until the page closes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cpu: any, heap: any;
  let cpuStarted = false, heapStarted = false;
  const heapTimeline: { t: number; usedMB: number; totalMB: number }[] = [];
  const startedAt = Date.now();
  let heapPoller: NodeJS.Timeout | undefined;
  let inputController: AbortController | undefined;
  let inputLoop: Promise<void> | undefined;
  try {
    await cdp.send('Profiler.start');
    cpuStarted = true;
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32_768 });
    heapStarted = true;

    heapPoller = setInterval(async () => {
      try {
        const res = await cdp.send('Performance.getMetrics');
        const used = res.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
        const total = res.metrics.find((m) => m.name === 'JSHeapTotalSize')?.value ?? 0;
        heapTimeline.push({
          t: (Date.now() - startedAt) / 1000,
          usedMB: used / (1024 * 1024),
          totalMB: total / (1024 * 1024),
        });
      } catch {
        // CDP may briefly fail; ignore
      }
    }, 1000);

    if (inputMode === 'random') {
      inputController = new AbortController();
      inputLoop = simulateRandomInput(page, inputController.signal);
    }

    await page.waitForTimeout(durationS * 1000);
  } finally {
    // Stop input first so no key events fire during profiler teardown.
    if (inputController) inputController.abort();
    if (inputLoop) {
      try { await inputLoop; } catch { /* abort or page closed */ }
    }
    if (heapPoller) clearInterval(heapPoller);
    // Stop in reverse-start order. Use try/catch — calling Stop on a never-started
    // profiler would throw, masking any earlier exception.
    if (heapStarted) {
      try { heap = await cdp.send('HeapProfiler.stopSampling'); } catch (e) { console.error('HeapProfiler.stopSampling failed:', e); }
    }
    if (cpuStarted) {
      try { cpu = await cdp.send('Profiler.stop'); } catch (e) { console.error('Profiler.stop failed:', e); }
    }
  }

  // Fail fast if either profiler couldn't return a result — without these,
  // there's no point continuing to artifact writes or analysis.
  expect(cpu, 'CPU profiler failed to stop').toBeDefined();
  expect(heap, 'Heap profiler failed to stop').toBeDefined();

  const sections = await page.evaluate(() => window.__perfTrace?.snapshot() ?? {});
  const frames = await page.evaluate(() => window.__fpsCounter?.dumpSamples() ?? { dts: [], count: 0, lastSampleTime: 0 });
  const longTasks = await page.evaluate(() => window.__longTasks ?? []);

  const meta = {
    scenario: { arena, bots: Number(bots), difficulty, durationS },
    runStartedAt: new Date(startedAt).toISOString(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    commit: process.env.PERF_COMMIT ?? 'unknown',
    buildOutDir: process.env.PERF_BUILD_DIR ?? 'dist-perf',
    baseUrl: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4175/bunnybrawl/',
  };

  writeFileSync(path.join(outDir, 'cpu.cpuprofile'), JSON.stringify(cpu.profile));
  writeFileSync(path.join(outDir, 'heap.heapprofile'), JSON.stringify(heap.profile));
  writeFileSync(path.join(outDir, 'sections.json'), JSON.stringify(sections, null, 2));
  writeFileSync(path.join(outDir, 'frame-samples.json'), JSON.stringify(frames));
  writeFileSync(path.join(outDir, 'long-tasks.json'), JSON.stringify(longTasks));
  writeFileSync(path.join(outDir, 'heap-timeline.json'), JSON.stringify(heapTimeline));
  writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(meta, null, 2));

  expect(cpu.profile.samples?.length ?? 0).toBeGreaterThan(0);
});

// Simulates a human player on P1: presses one key at a time, weighted toward
// movement (a/d), with occasional jumps (w) and rare crouches (s). Each press
// holds 80–300ms, then a 20–100ms pause. Loops until the AbortSignal fires;
// any keys still held are released in the finally so the page doesn't end with
// stuck input.
async function simulateRandomInput(page: Page, signal: AbortSignal): Promise<void> {
  const heldKeys = new Set<string>();
  const sleepUnlessAborted = (ms: number) => new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
  try {
    while (!signal.aborted) {
      // Weighted: 35% left, 35% right, 20% jump, 10% down.
      // Movement dominates because it's the hot path (physics + sprite cache
      // misses on every facing change). Jumping adds the airborne arc, falling,
      // and landing branches. Crouch is rare but exercises a separate state.
      const r = Math.random();
      const key = r < 0.35 ? 'a' : r < 0.70 ? 'd' : r < 0.90 ? 'w' : 's';
      const holdMs = 80 + Math.floor(Math.random() * 220);
      await page.keyboard.down(key);
      heldKeys.add(key);
      await sleepUnlessAborted(holdMs);
      if (signal.aborted) break;
      await page.keyboard.up(key);
      heldKeys.delete(key);
      const pauseMs = 20 + Math.floor(Math.random() * 80);
      await sleepUnlessAborted(pauseMs);
    }
  } finally {
    for (const key of heldKeys) {
      try { await page.keyboard.up(key); } catch { /* page may be closed */ }
    }
  }
}
