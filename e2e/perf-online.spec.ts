import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

/**
 * E2E perf profile for online multiplayer under various network conditions.
 *
 * Spawns host + guest in two browser contexts via Trystero MQTT. Each scenario
 * configures a different combination of:
 *   - network conditions (?simLatency, ?simJitter, ?simLoss URL params)
 *   - guest-side CPU throttling (CDP Emulation.setCPUThrottlingRate)
 *   - mods on/off
 * runs random input on both peers for the configured duration, then captures
 * perfTrace + frame samples + heap timeline + long tasks for both sides.
 *
 * Output: test-results/perf-online/{scenario}/{host,guest}-{cpu.cpuprofile,...}
 *
 * Trystero MQTT signaling: tests are tagged @online and depend on a public
 * MQTT broker, so retries help against transient connection failures.
 *
 * Usage:
 *   npx playwright test e2e/perf-online.spec.ts --project=chromium
 *   PERF_DURATION_S=10 npx playwright test e2e/perf-online.spec.ts -g baseline
 *
 * Env overrides:
 *   PERF_DURATION_S — seconds of gameplay per scenario (default 20)
 *   PERF_ARENA      — arena id (default space_station)
 *   PERF_OUT_DIR    — output base directory (default test-results/perf-online)
 */

interface PerfPage {
  page: Page;
  ctx: BrowserContext;
  label: 'host' | 'guest';
  cdp?: import('@playwright/test').CDPSession;
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

interface PlayerFrame {
  t: number;       // ms since sampler started
  // [slot, x, y, vx, vy, state]+ flattened — keeps per-frame size small.
  // state encoded as 0=idle, 1=run, 2=airborne, 3=splat, 4=respawning
  d: number[];
}

interface SnapshotArrival {
  t: number;       // ms since sampler started
  frame: number;   // host frame number
}

declare global {
  interface Window {
    __longTasks?: LongTaskEntry[];
    __playerSamples?: PlayerFrame[];
    __snapshotArrivals?: SnapshotArrival[];
    __samplerStart?: number;
    __samplerRafId?: number;
  }
}

const PLAYER_STATE_NUM: Record<string, number> = {
  idle: 0, run: 1, airborne: 2, splat: 3, respawning: 4,
};

interface Scenario {
  name: string;
  /** Description for the report — one line. */
  desc: string;
  /** Network simulator settings applied to BOTH peers via URL params. */
  network?: { latencyMs?: number; jitterMs?: number; lossPct?: number };
  /** CPU throttling applied to the guest only (low-end mobile simulation).
   *  4 = 4× slowdown, ~equivalent to a low-end Android device. */
  guestCpuSlowdown?: number;
  /** All-mods toggle (default true to stress the heaviest gameplay path). */
  allMods?: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    name: '01-baseline',
    desc: 'No network sim, no CPU throttle, all mods on',
    allMods: true,
  },
  {
    name: '02-mid-latency',
    desc: '80ms latency + 20ms jitter (typical 4G)',
    network: { latencyMs: 80, jitterMs: 20 },
    allMods: true,
  },
  {
    name: '03-high-latency',
    desc: '200ms latency + 50ms jitter (cellular / overseas)',
    network: { latencyMs: 200, jitterMs: 50 },
    allMods: true,
  },
  {
    name: '04-lossy',
    desc: '50ms latency + 5% packet loss (flaky wifi)',
    network: { latencyMs: 50, lossPct: 5 },
    allMods: true,
  },
  {
    name: '05-slow-guest',
    desc: '4× CPU throttle on guest (low-end Android)',
    guestCpuSlowdown: 4,
    allMods: true,
  },
  {
    name: '06-worst-case',
    desc: '200ms+50ms jitter + 5% loss + 4× CPU on guest',
    network: { latencyMs: 200, jitterMs: 50, lossPct: 5 },
    guestCpuSlowdown: 4,
    allMods: true,
  },
];

// ---- Setup helpers ----

async function createPerfPage(browser: Browser, label: 'host' | 'guest'): Promise<PerfPage> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await ctx.addInitScript(() => {
    const buf: LongTaskEntry[] = [];
    window.__longTasks = buf;
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & {
            attribution?: { name: string; entryType: string; containerType?: string; containerName?: string }[];
          };
          buf.push({ startTime: e.startTime, duration: e.duration, name: e.name, attribution: e.attribution ?? [] });
        }
      });
      obs.observe({ entryTypes: ['longtask'] });
    } catch { /* longtask not supported */ }
  });
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[${label.toUpperCase()}] ${msg.text()}`);
  });
  return { page, ctx, label };
}

/** Inject a per-frame sampler that records every player's position and an
 *  interpolation buffer-depth proxy at every RAF on the guest. Captures
 *  the data needed to detect freezes, teleports, and rubber-banding —
 *  player-feel artifacts that don't show up in CPU profiles. Also wraps
 *  EntityInterpolation.pushSnapshot to record snapshot arrival timing.
 *  Started after the match enters the 'playing' phase so loading-screen
 *  state doesn't contaminate the samples. */
async function startPlayerFeelSampler(p: PerfPage): Promise<void> {
  const PLAYER_STATE_MAP: Record<string, number> = { idle: 0, run: 1, airborne: 2, splat: 3, respawning: 4 };
  await p.page.evaluate(({ stateMap }) => {
    window.__playerSamples = [];
    window.__snapshotArrivals = [];
    window.__samplerStart = performance.now();
    const start = window.__samplerStart;

    const sampleFrame = () => {
      const loop = window.__gameLoop;
      const state = loop?.getState?.();
      if (state?.players) {
        const t = performance.now() - start;
        const d: number[] = [];
        for (let i = 0; i < state.players.length; i++) {
          const pl = state.players[i];
          d.push(i, pl.x, pl.y, pl.vx, pl.vy, stateMap[pl.state] ?? 0);
        }
        window.__playerSamples!.push({ t, d });
      }
      window.__samplerRafId = requestAnimationFrame(sampleFrame);
    };
    window.__samplerRafId = requestAnimationFrame(sampleFrame);

    // Poll the latest received snapshot frame number. NetMatch exposes
    // getLatestSnapshotFrame() for this. Polling at 4ms catches every arrival
    // (snapshots come in at ~16ms intervals @ 60Hz). Re-resolve __netMatch
    // every poll — it can be unset at sampler-start during early loading or
    // get replaced on reconnect, and a const-capture would silently miss it.
    let lastSeenFrame = -1;
    const pollSnap = () => {
      const nm = (window as { __netMatch?: { getLatestSnapshotFrame?: () => number } }).__netMatch;
      const frame = nm?.getLatestSnapshotFrame?.() ?? -1;
      if (frame >= 0 && frame !== lastSeenFrame) {
        lastSeenFrame = frame;
        window.__snapshotArrivals!.push({ t: performance.now() - start, frame });
      }
    };
    setInterval(pollSnap, 4);
  }, { stateMap: PLAYER_STATE_MAP });
}

async function stopPlayerFeelSampler(p: PerfPage): Promise<{ samples: PlayerFrame[]; arrivals: SnapshotArrival[] }> {
  return await p.page.evaluate(() => {
    if (window.__samplerRafId) cancelAnimationFrame(window.__samplerRafId);
    return {
      samples: window.__playerSamples ?? [],
      arrivals: window.__snapshotArrivals ?? [],
    };
  });
}

function buildSimQuery(network?: Scenario['network']): string {
  if (!network) return '';
  const parts: string[] = [];
  if (network.latencyMs) parts.push(`simLatency=${network.latencyMs}`);
  if (network.jitterMs) parts.push(`simJitter=${network.jitterMs}`);
  if (network.lossPct) parts.push(`simLoss=${network.lossPct}`);
  return parts.length ? '&' + parts.join('&') : '';
}

async function gotoWithDebug(p: PerfPage, scenario: Scenario): Promise<void> {
  // ?debug=perffps activates BOTH perfTrace and the FPS counter. perfTrace is
  // exposed on window only after Match mounts, so we can't assert it here.
  await p.page.goto('/?debug=perffps' + buildSimQuery(scenario.network));
}

async function applyGuestCpuThrottle(p: PerfPage, slowdown: number): Promise<void> {
  if (slowdown <= 1) return;
  const cdp = await p.ctx.newCDPSession(p.page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
  p.cdp = cdp;
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
  await expect(codeEl).toBeVisible({ timeout: 20000 });
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
  await expect(startBtn.or(readyBtn)).toBeVisible({ timeout: 30000 });
}

async function configureMatch(page: Page, arena: string, mods: Record<string, boolean>): Promise<void> {
  await page.evaluate(({ arena, mods }) => {
    const store = (window as { __gameStore?: { getState: () => { setMatchSettings: (s: unknown) => void } } }).__gameStore;
    store?.getState().setMatchSettings({ arenaId: arena, mods, killLimit: 999, timeLimit: 999 });
  }, { arena, mods });
}

async function simulateRandomInput(page: Page, signal: AbortSignal): Promise<void> {
  const heldKeys = new Set<string>();
  const sleepUnlessAborted = (ms: number) => new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
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

async function startProfilers(p: PerfPage): Promise<import('@playwright/test').CDPSession> {
  const cdp = p.cdp ?? await p.ctx.newCDPSession(p.page);
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
  longTasks: LongTaskEntry[];
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

interface FeelSummary {
  /** Total frames sampled. */
  frames: number;
  /** % of samples where any active player's position didn't change between
   *  consecutive guest frames despite a non-zero velocity in the snapshot —
   *  characteristic of frame stalls / interpolation freezes. */
  freezePct: number;
  /** Largest single-frame X displacement of any active player (px). Real
   *  movement is bounded by maxWalkSpeed * dt + a few overshoot pixels;
   *  anything past ~50 px in one frame is a teleport / desync respawn. */
  maxXJumpPx: number;
  /** Number of >50px single-frame X jumps across all samples. */
  teleportCount: number;
  /** Number of horizontal velocity-sign flips per second across all active
   *  players. Vibrating-sprite artifacts (oscillation between left/right
   *  echo) show up as elevated flip rate. Walking back-and-forth in random
   *  input gives a baseline rate; check ratio vs baseline scenario. */
  vxFlipsPerSec: number;
  /** Snapshot inter-arrival distribution (ms). */
  snapshotGap: { meanMs: number; p50Ms: number; p95Ms: number; maxMs: number; count: number };
  /** Number of snapshot gaps > 100 ms. Each one produces visible stutter on
   *  the guest because interpolation has to extrapolate past its safety
   *  bound (4 frames = 67 ms at 60Hz). */
  snapshotGapsOver100ms: number;
}

interface ScenarioSummary {
  name: string;
  desc: string;
  durationS: number;
  hostFps: number;
  guestFps: number;
  hostLongTasks: { count: number; totalMs: number; maxMs: number };
  guestLongTasks: { count: number; totalMs: number; maxMs: number };
  hostHeapDeltaMB: number;
  guestHeapDeltaMB: number;
  hostKeySections: Record<string, { avgMs: number; p95Ms: number; calls: number }>;
  guestKeySections: Record<string, { avgMs: number; p95Ms: number; calls: number }>;
  feel: FeelSummary;
}

function analyseGuestFeel(samples: PlayerFrame[], arrivals: SnapshotArrival[], arenaWidth = 1280): FeelSummary {
  const frames = samples.length;
  if (frames === 0) {
    return {
      frames: 0, freezePct: 0, maxXJumpPx: 0, teleportCount: 0, vxFlipsPerSec: 0,
      snapshotGap: { meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, count: 0 },
      snapshotGapsOver100ms: 0,
    };
  }

  // Each sample.d packs [slot, x, y, vx, vy, state] tuples. Walk every
  // adjacent sample pair and aggregate per-slot deltas.
  let freezeFrames = 0;
  let maxJump = 0;
  let teleportCount = 0;
  let vxFlips = 0;
  const FREEZE_VX_THRESHOLD = 30;   // px/s — below this, no movement is fine
  const TELEPORT_THRESHOLD = 50;    // px in one frame — above this is a desync/respawn
  // Arena wraps horizontally (physics.wrapHorizontal). A wrap looks like a
  // ~arenaWidth-px jump; ignore anything that crosses more than half the
  // arena in one frame as a wrap, not a desync.
  const WRAP_THRESHOLD = arenaWidth * 0.5;
  const STATE_SPLAT = 3;
  const STATE_RESPAWN = 4;

  // Build a map of slot → previous (x, vx, state) for cheap pairing.
  const prev = new Map<number, { x: number; vx: number; state: number }>();
  for (let i = 0; i < samples.length; i++) {
    const d = samples[i].d;
    for (let j = 0; j < d.length; j += 6) {
      const slot = d[j];
      const x = d[j + 1];
      const vx = d[j + 3];
      const st = d[j + 5];
      const p = prev.get(slot);
      if (p) {
        // Skip frames where the player respawned/died (legitimate teleport).
        const inDeath = st === STATE_SPLAT || st === STATE_RESPAWN
                     || p.state === STATE_SPLAT || p.state === STATE_RESPAWN;
        if (!inDeath) {
          const dx = Math.abs(x - p.x);
          if (dx < WRAP_THRESHOLD) {
            if (dx > maxJump) maxJump = dx;
            if (dx > TELEPORT_THRESHOLD) teleportCount++;
            if (dx === 0 && Math.abs(vx) > FREEZE_VX_THRESHOLD) freezeFrames++;
          }
          if (Math.sign(vx) !== Math.sign(p.vx) && vx !== 0 && p.vx !== 0) vxFlips++;
        }
      }
      prev.set(slot, { x, vx, state: st });
    }
  }

  const durationS = samples[samples.length - 1].t / 1000;
  const totalSlotPairs = samples.length * Math.max(1, prev.size);
  const freezePct = totalSlotPairs > 0 ? (freezeFrames / totalSlotPairs) * 100 : 0;
  const vxFlipsPerSec = durationS > 0 ? vxFlips / durationS : 0;

  // Snapshot gap analysis.
  const gaps: number[] = [];
  for (let i = 1; i < arrivals.length; i++) {
    gaps.push(arrivals[i].t - arrivals[i - 1].t);
  }
  gaps.sort((a, b) => a - b);
  const gapStats = gaps.length > 0 ? {
    meanMs: gaps.reduce((s, x) => s + x, 0) / gaps.length,
    p50Ms: gaps[Math.floor(gaps.length * 0.5)],
    p95Ms: gaps[Math.floor(gaps.length * 0.95)],
    maxMs: gaps[gaps.length - 1],
    count: gaps.length,
  } : { meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, count: 0 };
  const snapshotGapsOver100ms = gaps.filter(g => g > 100).length;

  return {
    frames, freezePct, maxXJumpPx: maxJump, teleportCount, vxFlipsPerSec,
    snapshotGap: gapStats, snapshotGapsOver100ms,
  };
}

function summariseProfile(profile: CapturedProfile, durationS: number, keys: string[]): {
  fps: number;
  longTasks: { count: number; totalMs: number; maxMs: number };
  heapDeltaMB: number;
  keySections: Record<string, { avgMs: number; p95Ms: number; calls: number }>;
} {
  const frames = profile.frames as { dts: number[]; count: number };
  const fps = frames?.count > 0 ? frames.count / durationS : 0;
  const lt = profile.longTasks ?? [];
  const longTasks = {
    count: lt.length,
    totalMs: lt.reduce((s, t) => s + t.duration, 0),
    maxMs: lt.reduce((m, t) => Math.max(m, t.duration), 0),
  };
  const heap = profile.heapTimeline ?? [];
  const used = heap.map(h => h.usedMB);
  const heapDeltaMB = used.length ? Math.max(...used) - Math.min(...used) : 0;
  const sections = profile.sections as Record<string, { calls: number; avgMs: number; p95Ms: number }>;
  const keySections: Record<string, { avgMs: number; p95Ms: number; calls: number }> = {};
  for (const k of keys) {
    if (sections?.[k]) {
      keySections[k] = {
        avgMs: sections[k].avgMs,
        p95Ms: sections[k].p95Ms,
        calls: sections[k].calls,
      };
    }
  }
  return { fps, longTasks, heapDeltaMB, keySections };
}

const HOST_KEYS = ['fixedUpdate', 'tickCosmetic', 'renderFrame', 'net.broadcastSnapshot'];
const GUEST_KEYS = ['renderFrame', 'tickCosmetic', 'net.handleSnapshot', 'net.decodeSnapshot', 'net.applySnapshot'];

// ---- Per-scenario test ----

async function runScenario(browser: Browser, scenario: Scenario, baseOutDir: string, durationS: number, arena: string): Promise<ScenarioSummary> {
  const outDir = path.join(baseOutDir, scenario.name);
  mkdirSync(outDir, { recursive: true });

  const host = await createPerfPage(browser, 'host');
  const guest = await createPerfPage(browser, 'guest');
  const pair: OnlinePair = { host, guest };

  try {
    await Promise.all([gotoWithDebug(host, scenario), gotoWithDebug(guest, scenario)]);

    // CPU throttle on guest happens AFTER goto so the page can finish loading.
    if (scenario.guestCpuSlowdown) {
      await applyGuestCpuThrottle(guest, scenario.guestCpuSlowdown);
    }

    const allMods = scenario.allMods ?? true;
    const mods = allMods ? {
      extremeGore: true, carrotChase: true, giantPlayers: true, turbo: true,
      superBounce: true, mirrorArena: true, underwaterGravity: true,
    } : {
      extremeGore: false, carrotChase: false, giantPlayers: false, turbo: false,
      superBounce: false, mirrorArena: false, underwaterGravity: false,
    };
    await configureMatch(host.page, arena, mods);

    const code = await hostCreateRoom(host.page, 'Host');
    await guestJoinRoom(guest.page, code, 'Guest');
    await waitForLobby(host.page);
    await waitForLobby(guest.page);

    await host.page.getByTestId('online-start-btn').click();
    await expect(host.page.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByTestId('match-screen')).toBeVisible({ timeout: 15000 });

    // Wait for both peers to leave loading + countdown.
    await Promise.all([
      host.page.waitForFunction(() => window.__gameLoop?.getState()?.phase === 'playing', undefined, { timeout: 20000 }),
      guest.page.waitForFunction(() => window.__gameLoop?.getState()?.phase === 'playing', undefined, { timeout: 20000 }),
    ]);
    await Promise.all([
      host.page.waitForFunction(() => window.__gameLoop?.getState()?.countdown === 0, undefined, { timeout: 15000 }),
      guest.page.waitForFunction(() => window.__gameLoop?.getState()?.countdown === 0, undefined, { timeout: 15000 }),
    ]);

    await Promise.all([
      host.page.evaluate(() => window.__perfTrace?.reset()),
      guest.page.evaluate(() => window.__perfTrace?.reset()),
    ]);

    const cdpHost = await startProfilers(host);
    const cdpGuest = await startProfilers(guest);
    const startedAt = Date.now();
    const heapHost = await pollHeap(cdpHost, startedAt);
    const heapGuest = await pollHeap(cdpGuest, startedAt);

    // Player-feel sampler runs only on the guest (interpolation is the side
    // that can produce visible artifacts; host is locally simulated).
    await startPlayerFeelSampler(guest);

    const inputAbort = new AbortController();
    const inputLoopHost = simulateRandomInput(host.page, inputAbort.signal);
    const inputLoopGuest = simulateRandomInput(guest.page, inputAbort.signal);

    await host.page.waitForTimeout(durationS * 1000);

    inputAbort.abort();
    try { await Promise.all([inputLoopHost, inputLoopGuest]); }
    catch { /* abort or page closed */ }
    heapHost.stop();
    heapGuest.stop();

    const guestFeel = await stopPlayerFeelSampler(guest);

    const hostProfile = await stopAndCapture(host, cdpHost, heapHost.timeline);
    const guestProfile = await stopAndCapture(guest, cdpGuest, heapGuest.timeline);

    writeProfile(outDir, 'host', hostProfile);
    writeProfile(outDir, 'guest', guestProfile);
    writeFileSync(path.join(outDir, 'guest-feel-samples.json'), JSON.stringify(guestFeel));

    const meta = {
      scenario: { ...scenario, durationS, arena },
      runStartedAt: new Date(startedAt).toISOString(),
    };
    writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(meta, null, 2));

    const hostSummary = summariseProfile(hostProfile, durationS, HOST_KEYS);
    const guestSummary = summariseProfile(guestProfile, durationS, GUEST_KEYS);
    const feelSummary = analyseGuestFeel(guestFeel.samples, guestFeel.arrivals);
    writeFileSync(path.join(outDir, 'guest-feel-summary.json'), JSON.stringify(feelSummary, null, 2));

    return {
      name: scenario.name,
      desc: scenario.desc,
      durationS,
      hostFps: hostSummary.fps,
      guestFps: guestSummary.fps,
      hostLongTasks: hostSummary.longTasks,
      guestLongTasks: guestSummary.longTasks,
      hostHeapDeltaMB: hostSummary.heapDeltaMB,
      guestHeapDeltaMB: guestSummary.heapDeltaMB,
      hostKeySections: hostSummary.keySections,
      guestKeySections: guestSummary.keySections,
      feel: feelSummary,
    };
  } finally {
    await pair.host.ctx.close().catch(() => {});
    await pair.guest.ctx.close().catch(() => {});
  }
}

function renderSummaryTable(summaries: ScenarioSummary[]): string {
  const lines: string[] = [];
  lines.push('# Online perf — multi-scenario run');
  lines.push('');
  lines.push('## Throughput & memory');
  lines.push('');
  lines.push('| scenario | host fps | guest fps | host long-tasks | guest long-tasks | host heap Δ | guest heap Δ |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const s of summaries) {
    const hostLT = `${s.hostLongTasks.count} (max ${s.hostLongTasks.maxMs.toFixed(0)}ms)`;
    const guestLT = `${s.guestLongTasks.count} (max ${s.guestLongTasks.maxMs.toFixed(0)}ms)`;
    lines.push(`| ${s.name} | ${s.hostFps.toFixed(1)} | ${s.guestFps.toFixed(1)} | ${hostLT} | ${guestLT} | ${s.hostHeapDeltaMB.toFixed(1)} MB | ${s.guestHeapDeltaMB.toFixed(1)} MB |`);
  }
  lines.push('');
  lines.push('## Player feel (guest)');
  lines.push('');
  lines.push('Freezes = guest frames where pos didn\'t move despite vx ≠ 0. Teleports = >50px X jump in one frame. vx flips/sec = horizontal velocity-sign reversals (rubber-banding signal). Snapshot gaps capture host→guest packet pacing — anything past 100ms forces extrapolation past its 4-frame safety bound.');
  lines.push('');
  lines.push('| scenario | frames | freeze % | teleports | max jump px | vx flips/s | snap p50 | snap p95 | snap max | gaps>100ms |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of summaries) {
    const f = s.feel;
    lines.push(
      `| ${s.name} | ${f.frames} | ${f.freezePct.toFixed(2)} | ${f.teleportCount} | ${f.maxXJumpPx.toFixed(1)}`
      + ` | ${f.vxFlipsPerSec.toFixed(2)} | ${f.snapshotGap.p50Ms.toFixed(1)}ms | ${f.snapshotGap.p95Ms.toFixed(1)}ms`
      + ` | ${f.snapshotGap.maxMs.toFixed(1)}ms | ${f.snapshotGapsOver100ms} |`,
    );
  }
  lines.push('');
  for (const s of summaries) {
    lines.push(`## ${s.name} — ${s.desc}`);
    lines.push('');
    lines.push('| section | host avg | host p95 | guest avg | guest p95 |');
    lines.push('|---|---|---|---|---|');
    const allKeys = new Set([...Object.keys(s.hostKeySections), ...Object.keys(s.guestKeySections)]);
    for (const k of allKeys) {
      const h = s.hostKeySections[k];
      const g = s.guestKeySections[k];
      const ha = h ? `${h.avgMs.toFixed(3)}ms` : '—';
      const hp = h ? `${h.p95Ms.toFixed(3)}ms` : '—';
      const ga = g ? `${g.avgMs.toFixed(3)}ms` : '—';
      const gp = g ? `${g.p95Ms.toFixed(3)}ms` : '—';
      lines.push(`| ${k} | ${ha} | ${hp} | ${ga} | ${gp} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---- The test suite ----

test.describe('online perf scenarios', { tag: '@online' }, () => {
  // Each scenario does its own setup → run → teardown. Sequential to avoid
  // contending for the public MQTT broker.
  test.describe.configure({ mode: 'serial' });

  const durationS = Number(process.env.PERF_DURATION_S ?? '20');
  const arena = process.env.PERF_ARENA ?? 'space_station';
  const baseOutDir = process.env.PERF_OUT_DIR
    ?? path.join(process.cwd(), 'test-results', 'perf-online');

  const summaries: ScenarioSummary[] = [];

  test.beforeAll(() => {
    mkdirSync(baseOutDir, { recursive: true });
  });

  test.afterAll(() => {
    if (summaries.length === 0) return;
    const report = renderSummaryTable(summaries);
    writeFileSync(path.join(baseOutDir, 'summary.md'), report);
    writeFileSync(path.join(baseOutDir, 'summary.json'), JSON.stringify(summaries, null, 2));
    console.log('\n' + report);
  });

  for (const scenario of SCENARIOS) {
    test(`${scenario.name} — ${scenario.desc}`, async ({ browser }) => {
      // Generous timeout: connection + loading + duration + capture overhead.
      test.setTimeout((durationS + 90) * 1000);
      const summary = await runScenario(browser, scenario, baseOutDir, durationS, arena);
      summaries.push(summary);

      // Expect at least minimal samples — fails the test if profiling silently
      // collapsed (which has happened with mid-run page closures).
      expect(summary.hostFps).toBeGreaterThan(10);
      expect(summary.guestFps).toBeGreaterThan(10);
    });
  }
});
