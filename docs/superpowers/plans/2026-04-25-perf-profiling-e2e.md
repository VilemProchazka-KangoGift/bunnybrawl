# Perf Profiling E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated CPU + heap + GC profiling workflow exposed as `npm run perf -- --arena=X --bots=N`. Outputs `test-results/perf/report.md` — a single markdown file Claude reads in one turn to propose fixes.

**Architecture:** Five new pieces. (1) `perfTrace.ts` adds gated `performance.now()` accumulators around hot engine subsystems. (2) `e2e/perf-profile.spec.ts` drives the run, attaches Chrome DevTools Protocol for CPU + heap profiles, polls heap size at 1Hz, observes long tasks, dumps everything. (3) `scripts/analyzePerfProfile.mjs` parses the artifacts, resolves locations through sourcemaps from a non-deployed `dist-perf/` build, emits markdown. (4) `scripts/runPerfProfile.mjs` wraps the lifecycle: build → preview server → playwright → analyzer. (5) Config glue: gitignore, package.json scripts, playwright testIgnore.

**Tech Stack:** Playwright 1.58 (CDP), Vite 8 (`--sourcemap` CLI flag, never config), `source-map` package for resolution, vitest for unit tests, Node 22 with ES modules. **Production build (`dist/`) is not changed — sourcemaps live only in `dist-perf/`.**

**Spec reference:** `docs/superpowers/specs/2026-04-25-perf-profiling-e2e-design.md`

---

## File Inventory

**Create:**
- `src/engine/perfTrace.ts` — section instrumentation
- `src/engine/__tests__/perfTrace.test.ts` — unit tests
- `e2e/perf-profile.spec.ts` — Playwright spec
- `scripts/runPerfProfile.mjs` — orchestration wrapper
- `scripts/analyzePerfProfile.mjs` — sourcemap-aware analyzer
- `scripts/__tests__/analyzePerfProfile.test.mjs` — analyzer unit tests

**Modify:**
- `src/engine/debugFlags.ts` — add `perfEnabled` field
- `src/engine/gameLoop/GameLoop.ts` — wrap `fixedUpdate` and `tickCosmetic`
- `src/engine/renderer.ts` — wrap `renderFrame`
- `src/engine/ai/awareness.ts` — wrap `buildAwareness`
- `src/engine/gameLoop/cosmetics/ParticleSystem.ts` — wrap `cosmeticUpdate`
- `src/engine/fpsCounter.ts` — add `dumpSamples()` exporter
- `src/components/Match.tsx` — expose `window.__perfTrace` and `window.__fpsCounter`
- `playwright.config.ts` — `testIgnore: ['**/perf-profile.spec.ts']`
- `package.json` — `perf`, `perf:build` scripts; add `source-map` dev-dep
- `.gitignore` — add `dist-perf/` (test-results/ is already ignored)

---

## Task 1: Add `perfEnabled` flag to debugFlags

**Files:**
- Modify: `src/engine/debugFlags.ts`

- [ ] **Step 1: Add `perfEnabled` field**

Edit `src/engine/debugFlags.ts`. After the `fpsEnabled` line, add:

```ts
  /** Whether perf instrumentation is collecting section timings (set via ?debug=perf, no keyboard toggle) */
  perfEnabled: debugParam.includes('perf'),
```

The full updated `debugFlags` object should look like:

```ts
export const debugFlags = {
  /** Whether nav debug was requested via URL (gates keyboard toggle) */
  navDebugAllowed: debugParam.includes('nav'),
  /** Whether nav debug overlay is currently visible */
  navDebugEnabled: debugParam.includes('nav'),
  /** Whether net debug was requested via URL (gates keyboard toggle) */
  netDebugAllowed: debugParam.includes('net'),
  /** Whether net debug overlay is currently visible */
  netDebugEnabled: debugParam.includes('net'),
  /** Whether fps overlay was requested via URL (gates keyboard toggle) */
  fpsAllowed: debugParam.includes('fps'),
  /** Whether fps overlay is currently visible */
  fpsEnabled: debugParam.includes('fps'),
  /** Whether perf instrumentation is collecting section timings (set via ?debug=perf, no keyboard toggle) */
  perfEnabled: debugParam.includes('perf'),
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc -b`
Expected: Exit code 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/debugFlags.ts
git commit -m "feat(perf): add perfEnabled debug flag for ?debug=perf"
```

---

## Task 2: Create `perfTrace.ts` with TDD

**Files:**
- Create: `src/engine/perfTrace.ts`
- Test: `src/engine/__tests__/perfTrace.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/__tests__/perfTrace.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { perfTrace } from '../perfTrace';

describe('perfTrace', () => {
  beforeEach(() => {
    perfTrace.reset();
    perfTrace.enabled = false;
  });

  describe('disabled (zero-overhead path)', () => {
    it('begin returns 0', () => {
      expect(perfTrace.begin('foo')).toBe(0);
    });

    it('end is a no-op when start is 0', () => {
      perfTrace.end('foo', 0);
      expect(perfTrace.snapshot()).toEqual({});
    });

    it('end is a no-op even when start is non-zero (defense in depth)', () => {
      perfTrace.end('foo', performance.now());
      expect(perfTrace.snapshot()).toEqual({});
    });
  });

  describe('enabled', () => {
    beforeEach(() => {
      perfTrace.enabled = true;
    });

    it('records a single timing', () => {
      const start = perfTrace.begin('foo');
      expect(start).toBeGreaterThan(0);
      perfTrace.end('foo', start);
      const snap = perfTrace.snapshot();
      expect(snap.foo).toBeDefined();
      expect(snap.foo.calls).toBe(1);
      expect(snap.foo.totalMs).toBeGreaterThanOrEqual(0);
      expect(snap.foo.avgMs).toBeGreaterThanOrEqual(0);
      expect(snap.foo.p95Ms).toBeGreaterThanOrEqual(0);
    });

    it('aggregates multiple sections independently', () => {
      const a = perfTrace.begin('a');
      perfTrace.end('a', a);
      const b1 = perfTrace.begin('b');
      perfTrace.end('b', b1);
      const b2 = perfTrace.begin('b');
      perfTrace.end('b', b2);
      const snap = perfTrace.snapshot();
      expect(snap.a.calls).toBe(1);
      expect(snap.b.calls).toBe(2);
    });

    it('reset clears all sections', () => {
      const start = perfTrace.begin('foo');
      perfTrace.end('foo', start);
      perfTrace.reset();
      expect(perfTrace.snapshot()).toEqual({});
    });

    it('snapshot returns avg = total / calls', () => {
      for (let i = 0; i < 5; i++) {
        const start = perfTrace.begin('x');
        for (let j = 0; j < 1000; j++) Math.sqrt(j);
        perfTrace.end('x', start);
      }
      const snap = perfTrace.snapshot();
      expect(snap.x.calls).toBe(5);
      expect(snap.x.avgMs).toBeCloseTo(snap.x.totalMs / 5, 5);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/perfTrace.test.ts`
Expected: FAIL with `Cannot find module '../perfTrace'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/perfTrace.ts`:

```ts
// Dev-only section timing instrumentation. Gated on debugFlags.perfEnabled.
// When disabled: begin returns 0 in O(1), end is a single boolean check.
// Captured at module init from the URL flag.

import { debugFlags } from './debugFlags';

interface SectionStats {
  calls: number;
  totalMs: number;
  avgMs: number;
  p95Ms: number;
}

interface SectionBuffer {
  samples: Float32Array;
  writeIdx: number;
  count: number;
  totalMs: number;
}

const MAX_SAMPLES_PER_SECTION = 10_000;
const sections = new Map<string, SectionBuffer>();

function getOrCreateBuffer(name: string): SectionBuffer {
  let buf = sections.get(name);
  if (!buf) {
    buf = {
      samples: new Float32Array(MAX_SAMPLES_PER_SECTION),
      writeIdx: 0,
      count: 0,
      totalMs: 0,
    };
    sections.set(name, buf);
  }
  return buf;
}

export const perfTrace = {
  enabled: debugFlags.perfEnabled,

  begin(_name: string): number {
    if (!perfTrace.enabled) return 0;
    return performance.now();
  },

  end(name: string, start: number): void {
    if (!perfTrace.enabled || start === 0) return;
    const elapsed = performance.now() - start;
    const buf = getOrCreateBuffer(name);
    buf.samples[buf.writeIdx % MAX_SAMPLES_PER_SECTION] = elapsed;
    buf.writeIdx++;
    if (buf.count < MAX_SAMPLES_PER_SECTION) buf.count++;
    buf.totalMs += elapsed;
  },

  snapshot(): Record<string, SectionStats> {
    const out: Record<string, SectionStats> = {};
    const work = new Float32Array(MAX_SAMPLES_PER_SECTION);
    for (const [name, buf] of sections) {
      if (buf.count === 0 || buf.writeIdx === 0) continue;
      for (let i = 0; i < buf.count; i++) work[i] = buf.samples[i];
      const slice = work.subarray(0, buf.count);
      slice.sort();
      const p95Idx = Math.min(buf.count - 1, Math.floor(buf.count * 0.95));
      out[name] = {
        calls: buf.writeIdx,
        totalMs: buf.totalMs,
        avgMs: buf.totalMs / buf.writeIdx,
        p95Ms: slice[p95Idx],
      };
    }
    return out;
  },

  reset(): void {
    sections.clear();
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/perfTrace.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Run full typecheck**

Run: `npx tsc -b`
Expected: Exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/engine/perfTrace.ts src/engine/__tests__/perfTrace.test.ts
git commit -m "feat(perf): add perfTrace section timing module with TDD"
```

---

## Task 3: Wire `perfTrace` into GameLoop hot paths

**Files:**
- Modify: `src/engine/gameLoop/GameLoop.ts`

- [ ] **Step 1: Add import**

In `src/engine/gameLoop/GameLoop.ts`, add to the import block (near the other engine imports around line 31):

```ts
import { perfTrace } from '../perfTrace';
```

- [ ] **Step 2: Wrap `fixedUpdate`**

Locate the `fixedUpdate` method (around line 543). Replace:

```ts
  /** Run one fixed-timestep simulation tick. Public for rollback engine. */
  fixedUpdate(dt: number, networkInputs?: Map<string, InputState>): void {
    this._networkInputs = networkInputs;
    if (this.stopped || this.state.matchOver) return;
```

with:

```ts
  /** Run one fixed-timestep simulation tick. Public for rollback engine. */
  fixedUpdate(dt: number, networkInputs?: Map<string, InputState>): void {
    const _t = perfTrace.begin('fixedUpdate');
    try {
      this._networkInputs = networkInputs;
      if (this.stopped || this.state.matchOver) return;
```

Then locate the closing brace of `fixedUpdate`. The method's last call is `this.matchSystem.fixedUpdate(dt);` followed by `}`. Replace that closing brace with:

```ts
      // Crowd cheering, periodic ambient sounds, match end check
      this.matchSystem.fixedUpdate(dt);
    } finally {
      perfTrace.end('fixedUpdate', _t);
    }
  }
```

> **Indentation note:** The existing fixedUpdate body is indented 4 spaces. After the `try {` wrap, every line inside the body must gain 2 more spaces. Either re-indent line by line or use Edit's `replace_all: false` with carefully-quoted multi-line strings. The simplest approach is to wrap it as one giant Edit — read the whole method first, then write the wrapped version.

- [ ] **Step 3: Wrap `tickCosmetic`**

Locate `tickCosmetic` (around line 396). Replace:

```ts
  tickCosmetic(dt: number): void {
    this._cosmeticLead += dt;
    if (this._cosmeticLead < COSMETIC_INTERVAL) return;
    const stepDt = Math.min(this._cosmeticLead, COSMETIC_MAX_STEP);
    this._cosmeticLead = 0;
    this.cosmeticStep(stepDt);
  }
```

with:

```ts
  tickCosmetic(dt: number): void {
    const _t = perfTrace.begin('tickCosmetic');
    try {
      this._cosmeticLead += dt;
      if (this._cosmeticLead < COSMETIC_INTERVAL) return;
      const stepDt = Math.min(this._cosmeticLead, COSMETIC_MAX_STEP);
      this._cosmeticLead = 0;
      this.cosmeticStep(stepDt);
    } finally {
      perfTrace.end('tickCosmetic', _t);
    }
  }
```

- [ ] **Step 4: Verify typecheck and existing tests pass**

Run: `npx tsc -b && npx vitest run src/engine/gameLoop`
Expected: Exit code 0; no new test failures (pre-existing failures in lobbyGame.test.ts and integration.test.ts are baseline).

- [ ] **Step 5: Commit**

```bash
git add src/engine/gameLoop/GameLoop.ts
git commit -m "feat(perf): instrument GameLoop.fixedUpdate and tickCosmetic"
```

---

## Task 4: Wire `perfTrace` into Renderer.renderFrame

**Files:**
- Modify: `src/engine/renderer.ts`

- [ ] **Step 1: Add import**

In `src/engine/renderer.ts`, add to the import block:

```ts
import { perfTrace } from './perfTrace';
```

- [ ] **Step 2: Wrap `renderFrame`**

Locate `renderFrame` (around line 364). The signature is:

```ts
  renderFrame(matchState: MatchState, arena: Arena, particles: Particle[], cosmeticLead = 0): void {
```

Wrap the entire method body in `try/finally`. Read the file with Read first to find the closing `}` of `renderFrame`, then:

After the opening `{`, insert:

```ts
    const _t = perfTrace.begin('renderFrame');
    try {
```

Before the closing `}`, insert:

```ts
    } finally {
      perfTrace.end('renderFrame', _t);
    }
```

Re-indent the existing body by +2 spaces.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc -b`
Expected: Exit code 0.

- [ ] **Step 4: Run renderer tests to confirm no regression**

Run: `npx vitest run src/engine/renderer.test.ts`
Expected: All tests pass (or same baseline as before this task).

- [ ] **Step 5: Commit**

```bash
git add src/engine/renderer.ts
git commit -m "feat(perf): instrument Renderer.renderFrame"
```

---

## Task 5: Wire `perfTrace` into buildAwareness

**Files:**
- Modify: `src/engine/ai/awareness.ts`

- [ ] **Step 1: Add import**

In `src/engine/ai/awareness.ts`, add at the top of the file (after existing imports):

```ts
import { perfTrace } from '../perfTrace';
```

- [ ] **Step 2: Wrap `buildAwareness`**

Locate `buildAwareness` (starts around line 52). The function ends with a `return { ...fields };` followed by the function's closing `}`.

Read the function fully first. Then:

After the existing line `const selfOnGround = self.state !== 'airborne';`, add **before it**:

```ts
  const _t = perfTrace.begin('awareness');
  try {
```

Before the function's closing `}`, replace the final `return { ... };` line and the closing brace with:

```ts
    return /* existing return-object literal */;
  } finally {
    perfTrace.end('awareness', _t);
  }
}
```

Re-indent the existing body by +2 spaces.

> **Pragmatic alternative if the function body is too large to indent cleanly:** factor the body into an inner helper:
>
> ```ts
> export function buildAwareness(...args): AwarenessSnapshot {
>   const _t = perfTrace.begin('awareness');
>   try {
>     return _buildAwarenessImpl(...args);
>   } finally {
>     perfTrace.end('awareness', _t);
>   }
> }
> function _buildAwarenessImpl(self: Player, state: MatchState, ...): AwarenessSnapshot {
>   /* existing body */
> }
> ```
>
> Either approach is fine. Use the helper-extraction form if the indentation diff is unwieldy.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc -b`
Expected: Exit code 0.

- [ ] **Step 4: Run AI tests**

Run: `npx vitest run src/engine/ai`
Expected: All AI tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/ai/awareness.ts
git commit -m "feat(perf): instrument buildAwareness"
```

---

## Task 6: Wire `perfTrace` into ParticleSystem.cosmeticUpdate

**Files:**
- Modify: `src/engine/gameLoop/cosmetics/ParticleSystem.ts`

- [ ] **Step 1: Add import**

In `src/engine/gameLoop/cosmetics/ParticleSystem.ts`, add to the imports:

```ts
import { perfTrace } from '../../perfTrace';
```

- [ ] **Step 2: Wrap `cosmeticUpdate`**

Locate `cosmeticUpdate` (around line 192). Replace:

```ts
  /** Update weather, particles, gibs, confetti. */
  cosmeticUpdate(dt: number): void {
    updateWeather(this.state, this.theme, dt);
    updateParticles(this._particles, this.particleFreeList, this.arena.platforms, this.settings.goreMode, this.newBloodDripsSinceRender, dt);
    updateGibs(this.state.gibs, this.arena.platforms, this.arena.effectZones, this.geyserIndexMap, this.state.geyserStates, this.newGroundedGibsSinceRender, dt);
    updateConfetti(this.state.confetti, this.state.timeElapsed, dt);
  }
```

with:

```ts
  /** Update weather, particles, gibs, confetti. */
  cosmeticUpdate(dt: number): void {
    const _t = perfTrace.begin('particles');
    try {
      updateWeather(this.state, this.theme, dt);
      updateParticles(this._particles, this.particleFreeList, this.arena.platforms, this.settings.goreMode, this.newBloodDripsSinceRender, dt);
      updateGibs(this.state.gibs, this.arena.platforms, this.arena.effectZones, this.geyserIndexMap, this.state.geyserStates, this.newGroundedGibsSinceRender, dt);
      updateConfetti(this.state.confetti, this.state.timeElapsed, dt);
    } finally {
      perfTrace.end('particles', _t);
    }
  }
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npx tsc -b && npx vitest run src/engine/gameLoop`
Expected: Exit code 0; no new failures.

- [ ] **Step 4: Commit**

```bash
git add src/engine/gameLoop/cosmetics/ParticleSystem.ts
git commit -m "feat(perf): instrument ParticleSystem.cosmeticUpdate"
```

---

## Task 7: Add `dumpSamples()` to fpsCounter and expose globals

**Files:**
- Modify: `src/engine/fpsCounter.ts`
- Modify: `src/components/Match.tsx`

- [ ] **Step 1: Add `dumpSamples` export to fpsCounter**

In `src/engine/fpsCounter.ts`, after `resetFpsCounter` and before `interface FpsStats`, add:

```ts
/** Dump the raw frame-time samples (newest-first) for E2E perf collection.
 *  Returns up to MAX_SAMPLES dt values in milliseconds. */
export function dumpSamples(): { dts: number[]; count: number } {
  const dts: number[] = [];
  for (let i = 0; i < total; i++) {
    const idx = (writeIdx - 1 - i + MAX_SAMPLES) % MAX_SAMPLES;
    dts.push(frameDts[idx]);
  }
  return { dts, count: total };
}
```

> **Note:** `fpsCounter.ts` already has an `if (!debugFlags.fpsEnabled) return;` guard inside `sampleFps`. Without `?debug=fps`, the buffer stays empty. The perf spec sets `?debug=perf` only — to also capture frame samples, the spec URL must include `debug=perffps`. The wrapper script handles this in Task 13. (`debugParam.includes('perf')` and `.includes('fps')` both match `'perffps'`.)

- [ ] **Step 2: Verify fpsCounter typecheck**

Run: `npx tsc -b`
Expected: Exit code 0.

- [ ] **Step 3: Expose `__perfTrace` and `__fpsCounter` from Match.tsx**

In `src/components/Match.tsx`, add static imports at the top of the file (with the other engine imports):

```tsx
import { perfTrace } from '../engine/perfTrace';
import * as fpsCounter from '../engine/fpsCounter';
```

Then locate the two places where `window.__gameLoop = ...` is set (around lines 226 and 257). After **each** of those assignments, add:

```tsx
      // E2E perf hooks (Spec: docs/superpowers/specs/2026-04-25-perf-profiling-e2e-design.md)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__perfTrace = perfTrace;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__fpsCounter = fpsCounter;
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc -b`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/fpsCounter.ts src/components/Match.tsx
git commit -m "feat(perf): expose __perfTrace and __fpsCounter globals for E2E"
```

---

## Task 8: Add gitignore entry for perf build output

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Verify current state**

Run: `grep -E "^(dist-perf|test-results)" .gitignore || echo "missing"`
Expected: `test-results/` already present, `dist-perf/` missing.

- [ ] **Step 2: Append `dist-perf/`**

Append to `.gitignore` (after the `test-results/` line):

```
dist-perf/
```

- [ ] **Step 3: Verify**

Run: `git check-ignore -q dist-perf && echo IGNORED || echo NOT_IGNORED`
Expected: `IGNORED`.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore(perf): ignore dist-perf/ build output"
```

---

## Task 9: Add `source-map` dev-dependency and npm scripts

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install source-map**

Run: `npm install --save-dev source-map@^0.7.4`
Expected: Adds `source-map` to `devDependencies`. `package-lock.json` updated.

- [ ] **Step 2: Add scripts**

In `package.json`, in the `"scripts"` block, add two entries. Replace:

```json
    "test:all": "vitest run && playwright test",
    "clean": "npx rimraf node_modules/.vite dist"
```

with:

```json
    "test:all": "vitest run && playwright test",
    "clean": "npx rimraf node_modules/.vite dist",
    "perf:build": "tsc -b && vite build --sourcemap --outDir dist-perf",
    "perf": "node scripts/runPerfProfile.mjs"
```

- [ ] **Step 3: Verify a build works**

Run: `npm run perf:build`
Expected: Build completes; `dist-perf/` directory created; `dist-perf/assets/` contains `.js` and `.js.map` files.

Run: `ls dist-perf/assets/*.js.map | head -3`
Expected: At least one `.map` file printed.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(perf): add source-map dep and perf/perf:build scripts"
```

---

## Task 10: Exclude perf spec from default e2e run

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 1: Add `testIgnore` to config**

In `playwright.config.ts`, replace:

```ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
```

with:

```ts
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/perf-profile.spec.ts'],
  fullyParallel: true,
```

- [ ] **Step 2: Commit**

```bash
git add playwright.config.ts
git commit -m "chore(perf): exclude perf-profile spec from default e2e run"
```

---

## Task 11: Create the Playwright perf spec

**Files:**
- Create: `e2e/perf-profile.spec.ts`

- [ ] **Step 1: Create the spec**

Create `e2e/perf-profile.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
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
    __perfTrace?: {
      snapshot: () => Record<string, { calls: number; totalMs: number; avgMs: number; p95Ms: number }>;
      reset: () => void;
      enabled: boolean;
    };
    __fpsCounter?: { dumpSamples: () => { dts: number[]; count: number } };
    __longTasks?: LongTaskEntry[];
    __gameLoop?: { getState(): { countdown: number; matchOver: boolean } };
  }
}

test('perf profile run', async ({ page, context }) => {
  const arena = process.env.PERF_ARENA ?? 'rooftops';
  const bots = process.env.PERF_BOTS ?? '4';
  const difficulty = process.env.PERF_DIFFICULTY ?? 'hard';
  const durationS = Number(process.env.PERF_DURATION_S ?? '30');
  const outDir = process.env.PERF_OUT_DIR ?? path.join(process.cwd(), 'test-results', 'perf');

  test.setTimeout((durationS + 60) * 1000);
  mkdirSync(outDir, { recursive: true });

  // Install in-page long-task observer BEFORE navigation
  await context.addInitScript(() => {
    const buf: LongTaskEntry[] = [];
    (window as Window).__longTasks = buf;
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

  // ?debug=perffps activates BOTH perfTrace AND fpsCounter (the substring matches both flags)
  await page.goto(`/?arena=${arena}&bots=${bots}&difficulty=${difficulty}&killLimit=999&debug=perffps`);
  await page.waitForFunction(() => window.__gameLoop?.getState()?.countdown === 0, undefined, { timeout: 15000 });
  expect(await page.evaluate(() => window.__perfTrace?.enabled)).toBe(true);

  // Reset perfTrace so countdown samples don't pollute the run
  await page.evaluate(() => window.__perfTrace?.reset());

  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Performance.enable');

  await cdp.send('Profiler.start');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32_768 });

  const heapTimeline: { t: number; usedMB: number; totalMB: number }[] = [];
  const startedAt = Date.now();
  const heapPoller = setInterval(async () => {
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

  await page.waitForTimeout(durationS * 1000);

  clearInterval(heapPoller);

  const cpu = await cdp.send('Profiler.stop');
  const heap = await cdp.send('HeapProfiler.stopSampling');

  const sections = await page.evaluate(() => window.__perfTrace?.snapshot() ?? {});
  const frames = await page.evaluate(() => window.__fpsCounter?.dumpSamples() ?? { dts: [], count: 0 });
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
```

- [ ] **Step 2: Verify spec parses (typecheck)**

Run: `npx tsc -b`
Expected: Exit code 0.

- [ ] **Step 3: Confirm Playwright recognizes the spec**

Run: `npx playwright test e2e/perf-profile.spec.ts --list`
Expected: Output contains `perf profile run`. (Default e2e run still excludes it via testIgnore.)

- [ ] **Step 4: Commit**

```bash
git add e2e/perf-profile.spec.ts
git commit -m "feat(perf): playwright spec capturing CPU + heap + frame artifacts"
```

---

## Task 12: Create the analysis script with TDD on helpers

**Files:**
- Create: `scripts/analyzePerfProfile.mjs`
- Create: `scripts/__tests__/analyzePerfProfile.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/analyzePerfProfile.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { flattenCpuProfile, computeFrameStats, bucketByModule } from '../analyzePerfProfile.mjs';

describe('analyzePerfProfile helpers', () => {
  describe('flattenCpuProfile', () => {
    it('aggregates self-time per node id from samples + timeDeltas', () => {
      const profile = {
        nodes: [
          { id: 1, callFrame: { functionName: 'a', url: 'http://x/a.js', lineNumber: 10, columnNumber: 0 }, hitCount: 0 },
          { id: 2, callFrame: { functionName: 'b', url: 'http://x/b.js', lineNumber: 20, columnNumber: 0 }, hitCount: 0 },
        ],
        samples: [1, 1, 2],
        timeDeltas: [100, 200, 300],
      };
      const flat = flattenCpuProfile(profile);
      expect(flat).toHaveLength(2);
      const totalSelf = flat.reduce((sum, n) => sum + n.selfMs, 0);
      expect(totalSelf).toBeCloseTo(0.6, 5);
    });

    it('drops V8 internal nodes from output', () => {
      const profile = {
        nodes: [
          { id: 1, callFrame: { functionName: '(garbage collector)', url: '', lineNumber: -1, columnNumber: -1 }, hitCount: 0 },
          { id: 2, callFrame: { functionName: 'real', url: 'http://x/a.js', lineNumber: 10, columnNumber: 0 }, hitCount: 0 },
        ],
        samples: [1, 2],
        timeDeltas: [100, 100],
      };
      const flat = flattenCpuProfile(profile);
      expect(flat.find((n) => n.functionName === '(garbage collector)')).toBeUndefined();
      expect(flat.find((n) => n.functionName === 'real')).toBeDefined();
    });
  });

  describe('computeFrameStats', () => {
    it('returns mean, p50, p95, p99, max, and long-frame counts', () => {
      const dts = [10, 12, 14, 14, 15, 16, 17, 18, 20, 100];
      const stats = computeFrameStats(dts);
      expect(stats.count).toBe(10);
      expect(stats.meanMs).toBeCloseTo(23.6, 1);
      expect(stats.maxMs).toBe(100);
      expect(stats.long16ms).toBe(4);
      expect(stats.long33ms).toBe(1);
    });

    it('returns zeros for empty samples', () => {
      const stats = computeFrameStats([]);
      expect(stats.count).toBe(0);
      expect(stats.meanMs).toBe(0);
    });
  });

  describe('bucketByModule', () => {
    it('aggregates self-time by top-level engine module', () => {
      const flat = [
        { source: 'src/engine/rendering/players.ts', selfMs: 100, functionName: 'a' },
        { source: 'src/engine/rendering/particles.ts', selfMs: 50, functionName: 'b' },
        { source: 'src/engine/ai/awareness.ts', selfMs: 30, functionName: 'c' },
        { source: 'src/engine/audio/AudioManager.ts', selfMs: 10, functionName: 'd' },
        { source: null, selfMs: 5, functionName: 'unresolved' },
      ];
      const buckets = bucketByModule(flat);
      const find = (m) => buckets.find((b) => b.module === m);
      expect(find('rendering')?.selfMs).toBe(150);
      expect(find('ai')?.selfMs).toBe(30);
      expect(find('audio')?.selfMs).toBe(10);
      expect(find('other')?.selfMs).toBe(5);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/__tests__/analyzePerfProfile.test.mjs`
Expected: FAIL with `Cannot find module '../analyzePerfProfile.mjs'`.

- [ ] **Step 3: Write the analyzer**

Create `scripts/analyzePerfProfile.mjs`:

```js
#!/usr/bin/env node
// @ts-check
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { SourceMapConsumer } from 'source-map';

const V8_INTERNAL_NAMES = new Set([
  '(garbage collector)',
  '(idle)',
  '(program)',
  '(root)',
  '',
]);

export function flattenCpuProfile(profile) {
  const selfTimeByNodeId = new Map();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i];
    const delta = deltas[i] ?? 0;
    selfTimeByNodeId.set(id, (selfTimeByNodeId.get(id) ?? 0) + delta);
  }

  const out = [];
  for (const node of profile.nodes ?? []) {
    if (V8_INTERNAL_NAMES.has(node.callFrame.functionName)) continue;
    const selfUs = selfTimeByNodeId.get(node.id) ?? 0;
    if (selfUs === 0) continue;
    out.push({
      id: node.id,
      functionName: node.callFrame.functionName,
      url: node.callFrame.url,
      lineNumber: node.callFrame.lineNumber,
      columnNumber: node.callFrame.columnNumber,
      selfMs: selfUs / 1000,
      source: null,
      sourceLine: null,
    });
  }
  out.sort((a, b) => b.selfMs - a.selfMs);
  return out;
}

export function computeFrameStats(dts) {
  if (dts.length === 0) {
    return { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, long16ms: 0, long33ms: 0 };
  }
  const sorted = [...dts].sort((a, b) => a - b);
  const sum = sorted.reduce((s, x) => s + x, 0);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    count: dts.length,
    meanMs: sum / dts.length,
    p50Ms: pct(0.5),
    p95Ms: pct(0.95),
    p99Ms: pct(0.99),
    maxMs: sorted[sorted.length - 1],
    long16ms: dts.filter((d) => d > 16.67).length,
    long33ms: dts.filter((d) => d > 33.33).length,
  };
}

export function bucketByModule(flat) {
  const buckets = new Map();
  for (const node of flat) {
    let mod = 'other';
    if (node.source) {
      const m = node.source.match(/src\/engine\/([^/]+)\//);
      if (m) mod = m[1];
      else if (node.source.startsWith('src/components/')) mod = 'components';
      else if (node.source.startsWith('src/store/')) mod = 'store';
    }
    buckets.set(mod, (buckets.get(mod) ?? 0) + node.selfMs);
  }
  return [...buckets.entries()]
    .map(([module, selfMs]) => ({ module, selfMs }))
    .sort((a, b) => b.selfMs - a.selfMs);
}

export async function buildSourceMapResolver(mapsDir) {
  const consumers = new Map();
  let mapFiles;
  try {
    mapFiles = readdirSync(mapsDir).filter((f) => f.endsWith('.js.map'));
  } catch {
    return null;
  }
  for (const fname of mapFiles) {
    const raw = JSON.parse(readFileSync(path.join(mapsDir, fname), 'utf8'));
    const consumer = await new SourceMapConsumer(raw);
    consumers.set(fname.slice(0, -4), consumer);
  }
  return {
    resolve(url, line, column) {
      if (!url) return null;
      let basename = url.split('/').pop() ?? '';
      const queryIdx = basename.indexOf('?');
      if (queryIdx >= 0) basename = basename.slice(0, queryIdx);
      const consumer = consumers.get(basename);
      if (!consumer) return null;
      const orig = consumer.originalPositionFor({
        line: Math.max(1, line + 1),
        column: Math.max(0, column),
      });
      if (!orig.source) return null;
      const cleaned = orig.source.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
      return { source: cleaned, line: orig.line ?? null };
    },
    destroy() {
      for (const c of consumers.values()) c.destroy();
    },
  };
}

function correlateLongFrames(dts, longTasks) {
  const ordered = [...dts].reverse();
  const timeline = [];
  let t = 0;
  for (const dt of ordered) {
    timeline.push({ tMs: t, dt });
    t += dt;
  }
  const long = timeline.filter((f) => f.dt > 25);
  return long.map((f) => {
    const window = 50;
    const overlap = longTasks.find((lt) => Math.abs(lt.startTime - f.tMs) <= window);
    return {
      tSec: (f.tMs / 1000).toFixed(2),
      frameMs: f.dt.toFixed(1),
      gcPauseMs: overlap ? overlap.duration.toFixed(1) : '—',
    };
  });
}

function summarizeHeapTimeline(timeline) {
  if (timeline.length === 0) return null;
  const start = timeline[0].usedMB;
  const end = timeline[timeline.length - 1].usedMB;
  const peak = Math.max(...timeline.map((p) => p.usedMB));
  const trough = Math.min(...timeline.map((p) => p.usedMB));
  let gcEvents = 0;
  let totalDrop = 0;
  for (let i = 1; i < timeline.length; i++) {
    const drop = timeline[i - 1].usedMB - timeline[i].usedMB;
    if (drop > 5) {
      gcEvents++;
      totalDrop += drop;
    }
  }
  return {
    startMB: start.toFixed(1),
    peakMB: peak.toFixed(1),
    endMB: end.toFixed(1),
    sawtoothMB: (peak - trough).toFixed(1),
    gcEvents,
    avgDropMB: gcEvents > 0 ? (totalDrop / gcEvents).toFixed(1) : '0',
    growthMB: (end - start).toFixed(1),
    leakSuspect: end - start > 30 && gcEvents < 3,
  };
}

function flattenHeapProfile(heap, durationS) {
  const out = [];
  function walk(node) {
    if (!node) return;
    if (node.selfSize > 0 && !V8_INTERNAL_NAMES.has(node.callFrame.functionName)) {
      out.push({
        functionName: node.callFrame.functionName,
        url: node.callFrame.url,
        lineNumber: node.callFrame.lineNumber,
        columnNumber: node.callFrame.columnNumber,
        bytesPerSec: node.selfSize / durationS / (1024 * 1024),
        source: null,
        sourceLine: null,
      });
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(heap.head);
  out.sort((a, b) => b.bytesPerSec - a.bytesPerSec);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const inIdx = args.indexOf('--in');
  const inDir = inIdx >= 0 ? args[inIdx + 1] : path.join(process.cwd(), 'test-results', 'perf');

  const cpu = JSON.parse(readFileSync(path.join(inDir, 'cpu.cpuprofile'), 'utf8'));
  const heap = JSON.parse(readFileSync(path.join(inDir, 'heap.heapprofile'), 'utf8'));
  const sections = JSON.parse(readFileSync(path.join(inDir, 'sections.json'), 'utf8'));
  const frames = JSON.parse(readFileSync(path.join(inDir, 'frame-samples.json'), 'utf8'));
  const longTasks = JSON.parse(readFileSync(path.join(inDir, 'long-tasks.json'), 'utf8'));
  const heapTimeline = JSON.parse(readFileSync(path.join(inDir, 'heap-timeline.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(path.join(inDir, 'metadata.json'), 'utf8'));

  const cpuFlat = flattenCpuProfile(cpu);
  const heapFlat = flattenHeapProfile(heap, meta.scenario.durationS);

  const mapsDir = path.join(process.cwd(), meta.buildOutDir, 'assets');
  const resolver = await buildSourceMapResolver(mapsDir);
  let unresolvedCount = 0;
  if (resolver) {
    for (const node of cpuFlat) {
      const orig = resolver.resolve(node.url, node.lineNumber, node.columnNumber);
      if (orig) {
        node.source = orig.source;
        node.sourceLine = orig.line;
      } else {
        unresolvedCount++;
      }
    }
    for (const node of heapFlat) {
      const orig = resolver.resolve(node.url, node.lineNumber, node.columnNumber);
      if (orig) {
        node.source = orig.source;
        node.sourceLine = orig.line;
      }
    }
    resolver.destroy();
  }

  const frameStats = computeFrameStats(frames.dts ?? []);
  const buckets = bucketByModule(cpuFlat);
  const totalCpuMs = cpuFlat.reduce((s, n) => s + n.selfMs, 0);
  const heapSummary = summarizeHeapTimeline(heapTimeline);
  const longFrames = correlateLongFrames(frames.dts ?? [], longTasks);

  const lines = [];
  lines.push(`# Perf Profile — ${meta.runStartedAt}`);
  lines.push('');
  lines.push(`**Scenario**: ${meta.scenario.arena} · ${meta.scenario.bots} bots ${meta.scenario.difficulty} · ${meta.scenario.durationS}s`);
  lines.push(`**Build**: ${meta.buildOutDir} (sourcemaps) · commit ${meta.commit}`);
  lines.push(`**User-Agent**: ${meta.userAgent}`);
  if (unresolvedCount > 0) {
    lines.push('');
    lines.push(`> ⚠ ${unresolvedCount} hotspot(s) could not be resolved via sourcemap. Confirm the perf build emitted .map files in \`${meta.buildOutDir}/assets/\`.`);
  }
  lines.push('');
  lines.push('## Frame stats (rAF samples)');
  lines.push('');
  if (frameStats.count > 0) {
    lines.push(`- avg ${frameStats.meanMs.toFixed(1)}ms (${(1000 / frameStats.meanMs).toFixed(0)} fps)`);
    lines.push(`- p50 ${frameStats.p50Ms.toFixed(1)} · p95 ${frameStats.p95Ms.toFixed(1)} · p99 ${frameStats.p99Ms.toFixed(1)} · max ${frameStats.maxMs.toFixed(1)}`);
    lines.push(`- long(>16.67ms): ${frameStats.long16ms}/${frameStats.count} (${((frameStats.long16ms / Math.max(1, frameStats.count)) * 100).toFixed(1)}%)`);
    lines.push(`- long(>33.33ms): ${frameStats.long33ms}/${frameStats.count}`);
  } else {
    lines.push('_(no frame samples — confirm ?debug=perffps in URL)_');
  }
  lines.push('');
  lines.push('## Heap timeline (1Hz)');
  lines.push('');
  if (heapSummary) {
    lines.push(`- start ${heapSummary.startMB}MB · peak ${heapSummary.peakMB}MB · end ${heapSummary.endMB}MB`);
    lines.push(`- growth ${heapSummary.growthMB}MB · sawtooth amplitude ~${heapSummary.sawtoothMB}MB`);
    lines.push(`- GC events: ${heapSummary.gcEvents} (avg drop ${heapSummary.avgDropMB}MB)`);
    if (heapSummary.leakSuspect) lines.push('- ⚠ Possible leak: heap grew >30MB with <3 GC events');
  } else {
    lines.push('_(no samples collected)_');
  }
  lines.push('');
  lines.push('## Section timings (mean ms/frame, ?debug=perf instrumentation)');
  lines.push('');
  const sectionRows = Object.entries(sections).sort((a, b) => b[1].avgMs - a[1].avgMs);
  if (sectionRows.length === 0) {
    lines.push('_(no section data — check ?debug=perf was set and __perfTrace was reachable)_');
  } else {
    lines.push('| Section | Calls | Total ms | Avg ms | p95 ms |');
    lines.push('|---------|-------|----------|--------|--------|');
    for (const [name, s] of sectionRows) {
      lines.push(`| ${name} | ${s.calls} | ${s.totalMs.toFixed(1)} | ${s.avgMs.toFixed(2)} | ${s.p95Ms.toFixed(2)} |`);
    }
  }
  lines.push('');
  lines.push(`## Top 20 CPU hotspots (self-time, total profile = ${totalCpuMs.toFixed(0)}ms)`);
  lines.push('');
  lines.push('| % | ms | File:line |');
  lines.push('|---|-----|-----------|');
  for (const node of cpuFlat.slice(0, 20)) {
    const pct = totalCpuMs > 0 ? ((node.selfMs / totalCpuMs) * 100).toFixed(1) : '0';
    const loc = node.source && node.sourceLine
      ? `${node.source}:${node.sourceLine}`
      : `${(node.url || '').split('/').pop() ?? '?'}:${node.lineNumber + 1}`;
    const fn = node.functionName || '(anonymous)';
    lines.push(`| ${pct} | ${node.selfMs.toFixed(0)} | ${loc} (${fn}) |`);
  }
  lines.push('');
  lines.push('## Top 20 allocation sites (sampled MB/sec)');
  lines.push('');
  lines.push('| MB/s | File:line |');
  lines.push('|------|-----------|');
  for (const node of heapFlat.slice(0, 20)) {
    const loc = node.source && node.sourceLine
      ? `${node.source}:${node.sourceLine}`
      : `${(node.url || '').split('/').pop() ?? '?'}:${node.lineNumber + 1}`;
    const fn = node.functionName || '(anonymous)';
    lines.push(`| ${node.bytesPerSec.toFixed(2)} | ${loc} (${fn}) |`);
  }
  lines.push('');
  lines.push('## Self-time by module');
  lines.push('');
  lines.push('| Module | % | ms |');
  lines.push('|--------|---|-----|');
  for (const b of buckets) {
    const pct = totalCpuMs > 0 ? ((b.selfMs / totalCpuMs) * 100).toFixed(1) : '0';
    lines.push(`| ${b.module} | ${pct} | ${b.selfMs.toFixed(0)} |`);
  }
  lines.push('');
  lines.push('## Long frames (with GC attribution)');
  lines.push('');
  if (longFrames.length === 0) {
    lines.push('_(no frames over 25ms)_');
  } else {
    lines.push('| t | frame ms | GC pause |');
    lines.push('|---|----------|----------|');
    for (const f of longFrames) {
      lines.push(`| ${f.tSec}s | ${f.frameMs} | ${f.gcPauseMs} |`);
    }
  }
  lines.push('');
  lines.push('## How to read this report');
  lines.push('');
  lines.push('The fastest path to fixes:');
  lines.push('1. **Section timings** — which subsystem dominates? That is the file scope to focus on.');
  lines.push('2. **CPU hotspots** — open the top 5 entries, read the cited line and surrounding function.');
  lines.push('3. **Allocation sites** — a function appearing in both is a high-value target (CPU + GC pressure).');
  lines.push('4. **Long frames** — for any with GC attribution, the allocation table tells you who to blame.');
  lines.push('');

  const reportPath = path.join(inDir, 'report.md');
  writeFileSync(reportPath, lines.join('\n'));
  console.log(`Report: ${reportPath}`);
}

const isDirectInvoke = process.argv[1] && process.argv[1].endsWith('analyzePerfProfile.mjs');
if (isDirectInvoke) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run: `npx vitest run scripts/__tests__/analyzePerfProfile.test.mjs`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyzePerfProfile.mjs scripts/__tests__/analyzePerfProfile.test.mjs
git commit -m "feat(perf): sourcemap-aware analyzer with TDD on helpers"
```

---

## Task 13: Create the run wrapper

**Files:**
- Create: `scripts/runPerfProfile.mjs`

This wraps `vite build → vite preview → playwright test → analyzer` into one command. Uses `child_process.spawn` and `execFileSync` (no shell, args as array — avoids shell injection).

- [ ] **Step 1: Create the wrapper**

Create `scripts/runPerfProfile.mjs`:

```js
#!/usr/bin/env node
// @ts-check
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import http from 'http';

function parseArgs(argv) {
  const out = { arena: 'rooftops', bots: '4', difficulty: 'hard', duration: '30' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    let key, val;
    if (eq > 0) {
      key = a.slice(2, eq);
      val = a.slice(eq + 1);
    } else if (a.startsWith('--')) {
      key = a.slice(2);
      val = argv[++i];
    } else continue;
    if (key in out) out[key] = val;
  }
  return out;
}

function getCommitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url} (last status ${res.statusCode})`));
        else setTimeout(tick, 250);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(tick, 250);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tick();
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
    });
    child.on('error', reject);
  });
}

function killProcess(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    // best effort
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const commit = getCommitSha();
  const buildDir = 'dist-perf';
  const outDir = path.join(process.cwd(), 'test-results', 'perf');
  const port = '4175';
  const baseUrl = `http://localhost:${port}/bunnybrawl/`;

  console.log(`\n=== Perf profile ===`);
  console.log(`scenario: ${opts.arena} · ${opts.bots} bots ${opts.difficulty} · ${opts.duration}s`);
  console.log(`commit:   ${commit}`);
  console.log(`out:      ${outDir}/report.md\n`);

  console.log('[1/4] Building perf bundle (sourcemaps → dist-perf/)…');
  await run('npm', ['run', 'perf:build']);

  console.log(`[2/4] Starting preview server on port ${port}…`);
  const preview = spawn('npx', ['vite', 'preview', '--outDir', buildDir, '--port', port], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  let previewClosed = false;
  preview.on('exit', () => { previewClosed = true; });
  preview.stderr?.on('data', (d) => process.stderr.write(d));

  const cleanup = () => {
    if (!previewClosed) killProcess(preview.pid);
  };

  try {
    await waitForUrl(baseUrl);

    console.log('[3/4] Running playwright spec…');
    await run('npx', ['playwright', 'test', 'e2e/perf-profile.spec.ts', '--reporter=line', '--retries=0'], {
      env: {
        ...process.env,
        PERF_ARENA: opts.arena,
        PERF_BOTS: opts.bots,
        PERF_DIFFICULTY: opts.difficulty,
        PERF_DURATION_S: opts.duration,
        PERF_OUT_DIR: outDir,
        PERF_COMMIT: commit,
        PERF_BUILD_DIR: buildDir,
        PLAYWRIGHT_BASE_URL: baseUrl,
      },
    });

    console.log('[4/4] Analyzing artifacts…');
    await run('node', ['scripts/analyzePerfProfile.mjs', '--in', outDir]);

    console.log(`\n✓ Done. Open ${path.join(outDir, 'report.md')}\n`);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('\n✗ Perf profile failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Sanity check (no full run yet)**

Run: `node scripts/runPerfProfile.mjs --arena=meadow --bots=2 --duration=5`

The full e2e test happens in Task 14. Use Ctrl-C after the build step starts to confirm arg parsing worked. (The full run is intentionally exercised end-to-end in Task 14.)

- [ ] **Step 3: Commit**

```bash
git add scripts/runPerfProfile.mjs
git commit -m "feat(perf): orchestrator wrapper for build → preview → spec → analyze"
```

---

## Task 14: End-to-end smoke test and verify report contents

**Files:**
- (No new files — verifying the full pipeline)

- [ ] **Step 1: Run the perf profile**

Run: `npm run perf -- --arena=rooftops --bots=4 --duration=15`

Expected:
- Builds dist-perf/ with sourcemaps (look for `.js.map` files in `dist-perf/assets/`)
- Starts preview server on port 4175
- Playwright runs the spec for ~15 seconds
- Analyzer writes `test-results/perf/report.md`
- Exit code 0
- Final stdout: `✓ Done. Open test-results/perf/report.md`

If the run takes longer than 90 seconds total, abort and inspect logs.

- [ ] **Step 2: Inspect the report**

Run: `cat test-results/perf/report.md` (or open the file directly).

Required sections, in order:
1. Header with scenario, build, user-agent
2. Frame stats (avg, p50/p95/p99, long-frame counts) — non-zero values
3. Heap timeline (start/peak/end MB, GC events)
4. Section timings table — at least `fixedUpdate`, `tickCosmetic`, `renderFrame`, `awareness`, `particles`
5. Top 20 CPU hotspots — file:line entries, **resolved** (paths starting with `src/engine/...`, not `chunk-XXX.js`)
6. Top 20 allocation sites
7. Self-time by module — `rendering`, `gameLoop` (or sub-modules), `ai`, etc.
8. Long frames table (or "no frames over 25ms")
9. "How to read this report" footer

- [ ] **Step 3: Diagnose and fix common issues**

Likely first-run gotchas and where to look:

**(a) "no section data" message in report**: The `?debug=perf` flag may not be reaching `perfTrace.enabled`. Check:
- The spec asserts `expect(await page.evaluate(() => window.__perfTrace?.enabled)).toBe(true)`. If that assertion failed, the test would have errored. If it passed but sections are empty, check that the engine wraps from Tasks 3–6 are actually being hit (e.g. add `console.log('fixedUpdate hit')` temporarily inside one wrap).

**(b) Hotspots show `chunk-XXX.js:1:NNNN` instead of `src/engine/...`**: Sourcemap resolution failing.
- Confirm `dist-perf/assets/` contains `.js.map` files: `ls dist-perf/assets/*.map | head`.
- Confirm `metadata.json` has `"buildOutDir": "dist-perf"`.
- Inspect a CPU profile node URL — does the basename match a `.map` filename in `dist-perf/assets/`? If basenames are mismatched (e.g. URL has `?t=...` query that survives the slice), the resolver `queryIdx` strip should handle it; otherwise add logging.

**(c) `cpu.profile.samples?.length ?? 0` is 0**: Profiler started but no samples accumulated. Increase `--duration`. The default 30s is plenty; even 15s should produce thousands of samples.

**(d) Vite preview won't start**: Port 4175 in use. Kill stray vite processes (Task Manager → vite.exe) and retry.

**(e) "no frame samples — confirm ?debug=perffps"**: The spec URL must contain `debug=perffps` (substring matching enables both flags). Verify the spec at `e2e/perf-profile.spec.ts` line that calls `page.goto`.

For each issue found, fix in the affected file (perfTrace, Match.tsx, analyzer, spec, or wrapper) and re-run from Step 1.

- [ ] **Step 4: Confirm production build is unaffected**

Run: `npm run build && ls dist/assets/*.map 2>&1 | head -3 || echo "no maps in dist (correct)"`
Expected: Build succeeds; either zero `.map` files in `dist/assets/`, or the `no maps in dist` branch fires.

- [ ] **Step 5: Commit any fixes from Step 3**

```bash
git add -p
git commit -m "fix(perf): <describe the issue addressed>"
```

(If no fixes needed, skip this step.)

- [ ] **Step 6: Final verification**

Run the full unit-test suite to confirm no regressions:

Run: `npx vitest run`
Expected: Same baseline as before this work (6–8 pre-existing failures in `lobbyGame.test.ts` + `integration.test.ts`; everything else green; +12 new tests passing from perfTrace + analyzer).

---

## Verification

After all tasks complete:

1. **`npm run perf` works end-to-end** — produces `test-results/perf/report.md` with resolved hotspots.
2. **`npm test` is unaffected** — only adds 12 new tests; pre-existing failures unchanged.
3. **`npm run test:e2e` skips perf-profile.spec.ts** — verified via testIgnore.
4. **`npm run build` produces no sourcemaps in dist/** — verified in Task 14 Step 4.
5. **`git status` is clean.**

## Out-of-scope reminders (do not implement)

- No CI gating, no regression detection, no stored baselines
- No multi-scenario suite (parameterized CLI is enough)
- No heuristic suggestions in the analyzer (Claude reads the report)
- No mobile profiling

## Self-review notes

Spec coverage:
- ✓ Sourcemaps in `dist-perf/`, never deployed (Tasks 8, 9, 14)
- ✓ Section instrumentation gated on `?debug=perf` (Tasks 1, 2, 3, 4, 5, 6)
- ✓ CPU profile via CDP (Task 11)
- ✓ Heap allocation profile via CDP (Task 11)
- ✓ Heap-size timeline 1Hz (Task 11)
- ✓ Long-task GC attribution (Tasks 11, 12)
- ✓ Sourcemap resolution to `src/engine/...:line` (Task 12)
- ✓ Markdown report optimized for Claude (Task 12)
- ✓ Single-command workflow `npm run perf` (Task 13)
- ✓ Parameterized CLI flags (Task 13)
- ✓ Excluded from default e2e run (Task 10)
- ✓ Production build untouched (Tasks 9, 14)

No placeholders. No "TODO". No "implement later". Every code block above is the literal content to write.
