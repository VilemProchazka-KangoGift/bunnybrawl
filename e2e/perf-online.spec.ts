import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

/**
 * E2E perf profile for online multiplayer.
 *
 * Spawns host + guest in two browser contexts, connects via Trystero MQTT
 * signaling, starts a match (default: space station with all mods enabled —
 * the worst-case scenario the user reported as choppy), drives random input
 * on both sides for `PERF_DURATION_S` seconds, then captures perfTrace
 * sections + frame samples + heap timeline for both peers.
 *
 * Output: test-results/perf-online/{host,guest}-{cpu.cpuprofile,heap.heapprofile,sections.json,frame-samples.json,heap-timeline.json}
 *
 * Tag: @online — uses the public MQTT broker, expect occasional flakiness.
 *
 * Usage:
 *   npx playwright test e2e/perf-online.spec.ts --headed --project=chromium
 *   PERF_ARENA=volcano PERF_DURATION_S=20 npx playwright test e2e/perf-online.spec.ts
 */

interface PerfPage {
  page: Page;
  ctx: BrowserContext;
  label: 'host' | 'guest';
}

interface OnlinePair {
  host: PerfPage;
  guest: PerfPage;
}

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

// ---- Setup helpers ----

async function createPerfPage(browser: Browser, label: 'host' | 'guest'): Promise<PerfPage> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Install long-task observer before any app code runs.
  await ctx.addInitScript(() => {
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
      // longtask not supported in some browsers; ignore.
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[${label.toUpperCase()}] ${msg.text()}`);
  });
  return { page, ctx, label };
}

async function gotoWithDebug(p: PerfPage): Promise<void> {
  // ?debug=perffps activates BOTH perfTrace and the FPS counter. perfTrace is
  // exposed on window only after Match mounts (see Match.tsx), so we can't
  // assert availability here — verify after the match starts instead.
  await p.page.goto('/?debug=perffps');
}

async function openOnlineModal(page: Page): Promise<void> {
  await page.getByTestId('online-btn').click();
  await page.waitForTimeout(200);
}

async function hostCreateRoom(page: Page, name = 'Host'): Promise<string> {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill(name);
  await page.getByTestId('online-create-btn').click();
  const codeEl = page.getByTestId('online-room-code');
  await expect(codeEl).toBeVisible({ timeout: 15000 });
  const code = await codeEl.textContent();
  expect(code).toMatch(/^[A-Z2-9]{3}$/);
  return code!;
}

async function guestJoinRoom(page: Page, code: string, name = 'Guest'): Promise<void> {
  await openOnlineModal(page);
  await page.getByTestId('online-name-input').fill(name);
  await page.getByTestId('online-join-btn').click();
  await page.getByTestId('online-code-input').fill(code);
  await page.getByTestId('online-join-submit').click();
}

async function waitForLobby(page: Page): Promise<void> {
  const startBtn = page.getByTestId('online-start-btn');
  const readyBtn = page.getByTestId('online-ready-btn');
  await expect(startBtn.or(readyBtn)).toBeVisible({ timeout: 20000 });
}

async function configureMatch(page: Page, arena: string, mods: Record<string, boolean>): Promise<void> {
  // Wire arena + all mods via the store before the match starts. SETTINGS_SYNC
  // will broadcast the host's settings to the guest, so we only need to
  // configure on the host side.
  await page.evaluate(({ arena, mods }) => {
    const store = (window as { __gameStore?: { getState: () => { setMatchSettings: (s: unknown) => void } } }).__gameStore;
    store?.getState().setMatchSettings({ arenaId: arena, mods, killLimit: 999, timeLimit: 999 });
  }, { arena, mods });
}

// Random input loop, identical to perf-profile.spec.ts so traces are comparable.
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

// ---- Per-peer profiling ----

async function startProfilers(p: PerfPage) {
  const cdp = await p.ctx.newCDPSession(p.page);
  await cdp.send('Profiler.enable');
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.start');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32_768 });
  return cdp;
}

interface CapturedProfile {
  cpu: unknown;
  heap: unknown;
  sections: unknown;
  frames: unknown;
  longTasks: unknown;
  heapTimeline: { t: number; usedMB: number; totalMB: number }[];
}

async function pollHeap(
  cdp: import('@playwright/test').CDPSession,
  startedAt: number,
): Promise<{ stop: () => void; timeline: { t: number; usedMB: number; totalMB: number }[] }> {
  const timeline: { t: number; usedMB: number; totalMB: number }[] = [];
  const interval = setInterval(async () => {
    try {
      const res = await cdp.send('Performance.getMetrics');
      const used = res.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
      const total = res.metrics.find((m) => m.name === 'JSHeapTotalSize')?.value ?? 0;
      timeline.push({
        t: (Date.now() - startedAt) / 1000,
        usedMB: used / (1024 * 1024),
        totalMB: total / (1024 * 1024),
      });
    } catch { /* CDP may briefly fail */ }
  }, 1000);
  return { stop: () => clearInterval(interval), timeline };
}

async function stopAndCapture(
  p: PerfPage,
  cdp: import('@playwright/test').CDPSession,
  heapTimeline: { t: number; usedMB: number; totalMB: number }[],
): Promise<CapturedProfile> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let heap: any, cpu: any;
  try { heap = await cdp.send('HeapProfiler.stopSampling'); }
  catch (e) { console.error(`[${p.label}] HeapProfiler.stopSampling failed:`, e); }
  try { cpu = await cdp.send('Profiler.stop'); }
  catch (e) { console.error(`[${p.label}] Profiler.stop failed:`, e); }

  const sections = await p.page.evaluate(() => window.__perfTrace?.snapshot() ?? {});
  const frames = await p.page.evaluate(() => window.__fpsCounter?.dumpSamples() ?? { dts: [], count: 0, lastSampleTime: 0 });
  const longTasks = await p.page.evaluate(() => window.__longTasks ?? []);
  return { cpu: cpu?.profile, heap: heap?.profile, sections, frames, longTasks, heapTimeline };
}

function writeProfile(outDir: string, label: string, profile: CapturedProfile): void {
  writeFileSync(path.join(outDir, `${label}-cpu.cpuprofile`), JSON.stringify(profile.cpu));
  writeFileSync(path.join(outDir, `${label}-heap.heapprofile`), JSON.stringify(profile.heap));
  writeFileSync(path.join(outDir, `${label}-sections.json`), JSON.stringify(profile.sections, null, 2));
  writeFileSync(path.join(outDir, `${label}-frame-samples.json`), JSON.stringify(profile.frames));
  writeFileSync(path.join(outDir, `${label}-long-tasks.json`), JSON.stringify(profile.longTasks));
  writeFileSync(path.join(outDir, `${label}-heap-timeline.json`), JSON.stringify(profile.heapTimeline));
}

// ---- The test ----

test('online perf profile run', { tag: '@online' }, async ({ browser }) => {
  const arena = process.env.PERF_ARENA ?? 'space_station';
  const durationS = Number(process.env.PERF_DURATION_S ?? '30');
  const allMods = process.env.PERF_MODS !== 'off';
  const outDir = process.env.PERF_OUT_DIR
    ?? path.join(process.cwd(), 'test-results', 'perf-online');

  test.setTimeout((durationS + 90) * 1000);
  mkdirSync(outDir, { recursive: true });

  const host = await createPerfPage(browser, 'host');
  const guest = await createPerfPage(browser, 'guest');
  const pair: OnlinePair = { host, guest };

  try {
    await Promise.all([gotoWithDebug(host), gotoWithDebug(guest)]);

    // Configure match settings on host BEFORE creating the room — SETTINGS_SYNC
    // sends them to the guest after handshake.
    const mods = allMods ? {
      extremeGore: true,
      carrotChase: true,
      giantPlayers: true,
      turbo: true,
      superBounce: true,
      mirrorArena: true,
      underwaterGravity: true,
    } : {
      extremeGore: false, carrotChase: false, giantPlayers: false, turbo: false,
      superBounce: false, mirrorArena: false, underwaterGravity: false,
    };
    await configureMatch(host.page, arena, mods);

    // Connect.
    const code = await hostCreateRoom(host.page, 'Host');
    await guestJoinRoom(guest.page, code, 'Guest');
    await waitForLobby(host.page);
    await waitForLobby(guest.page);

    // Start match.
    await host.page.getByTestId('online-start-btn').click();
    await expect(host.page.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });

    // Wait for both peers to leave the loading phase. Guest's network warmup
    // gate (12 snapshots + 250ms + RTT) plus host's preload typically take
    // well under 5 s; allow 15 s for slow networks.
    await Promise.all([
      host.page.waitForFunction(
        () => window.__gameLoop?.getState()?.phase === 'playing',
        undefined,
        { timeout: 15000 },
      ),
      guest.page.waitForFunction(
        () => window.__gameLoop?.getState()?.phase === 'playing',
        undefined,
        { timeout: 15000 },
      ),
    ]);
    // Wait past countdown (~3 s).
    await Promise.all([
      host.page.waitForFunction(
        () => window.__gameLoop?.getState()?.countdown === 0,
        undefined,
        { timeout: 10000 },
      ),
      guest.page.waitForFunction(
        () => window.__gameLoop?.getState()?.countdown === 0,
        undefined,
        { timeout: 10000 },
      ),
    ]);

    // Reset perfTrace on both so the loading + countdown samples don't pollute the run.
    await Promise.all([
      host.page.evaluate(() => window.__perfTrace?.reset()),
      guest.page.evaluate(() => window.__perfTrace?.reset()),
    ]);

    // Start CPU + heap profilers on both peers.
    const cdpHost = await startProfilers(host);
    const cdpGuest = await startProfilers(guest);
    const startedAt = Date.now();
    const heapHost = await pollHeap(cdpHost, startedAt);
    const heapGuest = await pollHeap(cdpGuest, startedAt);

    // Drive random input on both pages in parallel.
    const inputAbort = new AbortController();
    const inputLoopHost = simulateRandomInput(host.page, inputAbort.signal);
    const inputLoopGuest = simulateRandomInput(guest.page, inputAbort.signal);

    await host.page.waitForTimeout(durationS * 1000);

    // Stop input first so no key events fire during profiler teardown.
    inputAbort.abort();
    try { await Promise.all([inputLoopHost, inputLoopGuest]); }
    catch { /* abort or page closed */ }
    heapHost.stop();
    heapGuest.stop();

    const hostProfile = await stopAndCapture(host, cdpHost, heapHost.timeline);
    const guestProfile = await stopAndCapture(guest, cdpGuest, heapGuest.timeline);

    writeProfile(outDir, 'host', hostProfile);
    writeProfile(outDir, 'guest', guestProfile);

    const meta = {
      scenario: { arena, allMods, durationS },
      runStartedAt: new Date(startedAt).toISOString(),
      hostUserAgent: await host.page.evaluate(() => navigator.userAgent),
      guestUserAgent: await guest.page.evaluate(() => navigator.userAgent),
      commit: process.env.PERF_COMMIT ?? 'unknown',
    };
    writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(meta, null, 2));

    expect((hostProfile.cpu as { samples?: unknown[] })?.samples?.length ?? 0).toBeGreaterThan(0);
    expect((guestProfile.cpu as { samples?: unknown[] })?.samples?.length ?? 0).toBeGreaterThan(0);
  } finally {
    await pair.host.ctx.close().catch(() => {});
    await pair.guest.ctx.close().catch(() => {});
  }
});
