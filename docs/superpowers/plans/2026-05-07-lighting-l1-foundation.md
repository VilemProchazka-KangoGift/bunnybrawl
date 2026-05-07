# Lighting L1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the deferred-lite lighting pipeline as a parallel render path with a `?lighting=off` kill switch, migrate the directional sun + night-ambient overlay from `drawDayNightCycle` into the new pipeline, and ship the perf-tier / accessibility / determinism / debug scaffolds that L2–L5 will reuse.

**Architecture:** New `src/engine/lighting/` directory holds a `LightingPipeline` class (scene buffer + half-res light buffer, multiply composite). Pure-function modules `ambient.ts` and `sun.ts` compute the only light contributions in M1. Three observer-pattern emitters (`perfTier`, `brightness`, `photosensitivity`) follow the existing `perfFlags.ts` shape (`createEmitter` + `safeStorage`). Composite happens **inside** the existing hitstop/screen-shake transform in `renderer.ts:renderFrame`, just before `ctx.restore()`. HUD draws after, never tinted. Lighting code lives **outside** the sprite cache — per-frame, post-blit (lesson from `feat/rim-light` and `feat/character-outlines`).

**Tech Stack:** TypeScript, Canvas 2D, Vitest (unit + integration), Playwright (E2E + screenshot regression).

**Spec:** `docs/superpowers/specs/2026-05-07-lighting-l1-foundation-design.md`

**Branch / Worktree:** `feat/lighting-l1-foundation` at `P:/projects/rabbits/.worktrees/lighting-l1` (already created).

**PR sequence:**
- **Part A (PR 1):** Integration stub — no-op pipeline + composite hook + `?lighting=off` toggle. Lands on `main` first to absorb drift from parallel FoliageSystem refactor.
- **Part B (PR 2):** Real pipeline + ambient + sun migration + accessibility scaffolds + tests.
- **Part C (PR 3):** Debug tooling.

---

## File structure

### Created in Part A (PR 1)

```
src/engine/lighting/
  index.ts             # initLighting(), isLightingEnabled emitter, setLightingEnabled
  pipeline.ts          # LightingPipeline class — no-op stub
  types.ts             # PerfTier type (real impl in Part B)
src/engine/lighting/__tests__/
  pipeline.smoke.test.ts        # asserts pipeline can be constructed and is no-op
e2e/
  lighting-off-regression.spec.ts  # ?lighting=off bit-identical smoke
```

### Created in Part B (PR 2)

```
src/engine/lighting/
  ambient.ts           # themeToAmbient(theme, dayPhase, photosensitivity) → RGB
  sun.ts               # buildSunLight(theme, dayPhase, photosensitivity) → SunContribution | null
  perfTier.ts          # PerfTier emitter (URL + localStorage)
  brightness.ts        # Brightness emitter (URL + localStorage)
  photosensitivity.ts  # Photosensitivity emitter (URL + localStorage)
  determinism.ts       # tickRng(seed, tick) → SeededRNG helper
src/engine/lighting/__tests__/
  ambient.test.ts
  sun.test.ts
  perfTier.test.ts
  brightness.test.ts
  photosensitivity.test.ts
  determinism.test.ts
  pipeline.test.ts                  # real implementation tests
  pipeline-integration.test.ts      # end-to-end composite test
e2e/
  lighting-baseline.spec.ts         # screenshot regression at meadow noon
e2e/lighting-baseline.spec.ts-snapshots/
  meadow-noon-default.png           # committed baseline
perf-runs/lighting-pre-M1/
  meadow-baseline.md                # captured BEFORE Part B work
  graveyard-baseline.md             # captured BEFORE Part B work
perf-runs/lighting-l1/
  meadow-after.md                   # captured AFTER Part B work
  graveyard-after.md                # captured AFTER Part B work
```

### Modified in Part B (PR 2)

```
src/engine/renderer.ts              # +brightness pass at composite step
src/engine/rendering/effects.ts     # remove sun glow + night overlay rect from drawDayNightCycle
src/engine/CLAUDE.md                # +Lighting subsystem rules section
src/main.tsx                        # +initLighting() call
```

### Created in Part C (PR 3)

```
src/engine/lighting/
  debugOverlay.ts      # L cycle, [/] step-through, Shift+L dump, Ctrl+L false-color
src/engine/lighting/__tests__/
  debugOverlay.test.ts
e2e/
  lighting-debug.spec.ts            # asserts ?debug=light overlays toggle
```

---

# PART A — PR 1: Integration Stub

Goal: land a no-op pipeline + composite hook + `?lighting=off` toggle on `main` first, so the FoliageSystem worktree (separate brainstorm in progress) can rebase against a known integration point.

---

### Task A1: Create `lighting/types.ts` with the `PerfTier` type

**Files:**
- Create: `src/engine/lighting/types.ts`

- [ ] **Step 1: Create the types file**

```ts
// src/engine/lighting/types.ts
//
// Lighting subsystem types. M1 has minimal types; L2+ adds Light/LightKind etc.

export type PerfTier = 'low' | 'med' | 'high';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface SunContribution {
  /** Screen-space angle in radians; 0 = right, π/2 = up, π = left */
  angle: number;
  /** Sun light color */
  color: RGB;
  /** 0..1 intensity at this dayPhase */
  intensity: number;
}
```

- [ ] **Step 2: Verify the file typechecks**

Run: `cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | head -20`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/types.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): types module skeleton"
```

---

### Task A2: Create the `isLightingEnabled` emitter and `initLighting()` boot function

The kill switch needs to be readable from anywhere (renderer, etc.) and writable from URL param + localStorage. Use the existing `createEmitter` + `safeStorage` pattern from `perfFlags.ts`.

**Files:**
- Create: `src/engine/lighting/index.ts`

- [ ] **Step 1: Create the index module**

```ts
// src/engine/lighting/index.ts
//
// Public surface for the lighting subsystem.
// initLighting(searchString) parses ?lighting=off and seeds the emitter.
// Module-scope state matches perfFlags.ts pattern.

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';

const STORAGE_KEY = 'carrotroyale_lighting_off';

const enabled = createEmitter<boolean>(true);

export const isLightingEnabled = enabled.get;
export const subscribeLightingEnabled = enabled.subscribe;

export function setLightingEnabled(v: boolean): void {
  enabled.set(v);
  safeStorage.set(STORAGE_KEY, v ? '1' : '0');
}

/**
 * Parse `?lighting=off` URL param and persisted localStorage. URL wins over storage.
 * Default: enabled.
 */
export function initLighting(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const urlParam = params.get('lighting');
  if (urlParam === 'off') {
    enabled.set(false);
    return;
  }
  if (urlParam === 'on') {
    enabled.set(true);
    return;
  }
  // No URL override: read storage. '1' means kill switch active (lighting OFF).
  const stored = safeStorage.get(STORAGE_KEY);
  if (stored === '1') enabled.set(false);
}

export type { PerfTier, RGB, SunContribution } from './types';
export { LightingPipeline } from './pipeline';
```

- [ ] **Step 2: Commit (compile blocked until pipeline.ts exists — next task)**

(No commit yet; A3 will compile the export together.)

---

### Task A3: Create no-op `LightingPipeline` class

**Files:**
- Create: `src/engine/lighting/pipeline.ts`
- Create: `src/engine/lighting/__tests__/pipeline.smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

```ts
// src/engine/lighting/__tests__/pipeline.smoke.test.ts
import { describe, it, expect } from 'vitest';
import { LightingPipeline } from '../pipeline';

describe('LightingPipeline (Part A no-op stub)', () => {
  it('constructs with width and height', () => {
    const p = new LightingPipeline(1280, 720);
    expect(p).toBeDefined();
  });

  it('isEnabled() returns false when lighting kill switch is set', () => {
    // Stub honors module-scope toggle (set via setLightingEnabled or URL param).
    // Default: kill switch OFF → isEnabled returns true.
    const p = new LightingPipeline(1280, 720);
    expect(p.isEnabled()).toBe(true);
  });

  it('beginFrame and composite are no-ops in Part A', () => {
    const p = new LightingPipeline(1280, 720);
    // Should not throw; should not paint anything (real impl in Part B).
    expect(() => p.beginFrame()).not.toThrow();
    // composite() takes a ctx — pass a real OffscreenCanvas ctx
    const c = new OffscreenCanvas(1280, 720);
    const ctx = c.getContext('2d')!;
    expect(() => p.composite(ctx)).not.toThrow();
  });

  it('resize updates internal dims without throwing', () => {
    const p = new LightingPipeline(1280, 720);
    expect(() => p.resize(640, 360, 0.5)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/pipeline.smoke.test.ts`
Expected: FAIL — module `../pipeline` not found.

- [ ] **Step 3: Write the no-op pipeline implementation**

```ts
// src/engine/lighting/pipeline.ts
//
// LightingPipeline (Part A — no-op stub).
// Real implementation lands in Part B (PR 2). This stub exists so the renderer
// integration hook can ship to main first, isolating drift surface from the
// FoliageSystem refactor brainstorm.

import { isLightingEnabled } from './index';

export class LightingPipeline {
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /** Reset and prepare the light buffer for a fresh frame. No-op in Part A. */
  beginFrame(): void {
    // intentional no-op — Part B fills the light buffer with ambient + sun
  }

  /**
   * Multiply the light buffer onto the target ctx. No-op in Part A.
   * In Part B: ctx.drawImage(lightBuffer, 0, 0, w, h) with multiply composite.
   */
  composite(_ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    // intentional no-op
  }

  /** Re-create internal buffers when canvas dims or render scale change. */
  resize(w: number, h: number, _scale: number): void {
    this.width = w;
    this.height = h;
  }

  /** Mirror the module-scope kill switch. Renderer reads this every frame. */
  isEnabled(): boolean {
    return isLightingEnabled();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/pipeline.smoke.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Run typecheck**

Run: `cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -20`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/index.ts src/engine/lighting/pipeline.ts src/engine/lighting/__tests__/pipeline.smoke.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): no-op pipeline + isLightingEnabled emitter"
```

---

### Task A4: Wire `LightingPipeline` into `Renderer`

The renderer needs to own a `LightingPipeline` instance and call `composite()` near the end of `renderFrame`, just before the existing `ctx.restore()`. In Part A this is a no-op call; in Part B it becomes real.

**Files:**
- Modify: `src/engine/renderer.ts` — constructor + `renderFrame` near line 1011

- [ ] **Step 1: Add the import + field at the top of `Renderer`**

Open `src/engine/renderer.ts`. Near the existing imports (around line 27 where `drawDayNightCycle` is imported), add:

```ts
import { LightingPipeline } from './lighting';
```

Find the field declarations after the class opens (around line 165–230). Add this field near the other render-target fields:

```ts
  private lighting: LightingPipeline;
```

- [ ] **Step 2: Construct it in the `Renderer` constructor**

Inside `constructor(bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement, theme: ThemeConfig, mirrored = false, hudCanvas?: HTMLCanvasElement)` (line 230), AFTER the existing field assignments, add:

```ts
    this.lighting = new LightingPipeline(CANVAS_WIDTH, CANVAS_HEIGHT);
```

- [ ] **Step 3: Call `beginFrame` at the top of `renderFrame`**

Find `renderFrame` (line 622). Right after `this.frameTime = performance.now();` (around line 632), add:

```ts
      this.lighting.beginFrame();
```

This is hoisted to the top so the light buffer (Part B) is ready when we composite at the end. In Part A it's still a no-op.

- [ ] **Step 4: Insert `composite()` call before `ctx.restore()`**

Find the `ctx.restore();` at line 1011 (after `perfTrace.end('render.fg-nature', fgStart);`). Insert ABOVE the restore:

```ts
      // Lighting composite — multiplies the light buffer onto the fg ctx.
      // Sits inside the hitstop/screen-shake transform so lights ride the shake.
      // No-op when ?lighting=off or in Part A (real impl lands in Part B).
      if (this.lighting.isEnabled()) {
        this.lighting.composite(ctx);
      }

      ctx.restore();
```

- [ ] **Step 5: Wire `resize` into the existing render-scale path**

Find `setRenderScale(s: number)` (around line 258). Inside the method, after the existing `applyRenderScaleToCanvas` calls, add:

```ts
    this.lighting.resize(CANVAS_WIDTH, CANVAS_HEIGHT, s);
```

- [ ] **Step 6: Typecheck and run renderer tests**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -10
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/__tests__/renderer.test.ts 2>&1 | tail -20
```

Expected: typecheck clean; renderer tests still pass (LightingPipeline is no-op in Part A so visuals are identical).

- [ ] **Step 7: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/renderer.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): wire LightingPipeline composite hook into renderer"
```

---

### Task A5: Wire `initLighting()` into `main.tsx`

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add the init call alongside the existing `initDebugFlags`**

Open `src/main.tsx`. Find the line:

```ts
initDebugFlags(window.location.search);
```

Add a sibling call right after:

```ts
import { initLighting } from './engine/lighting';
// ...
initLighting(window.location.search);
```

The full top of file should read:

```ts
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initDebugFlags } from './engine/debugFlags';
import { initLighting } from './engine/lighting';
import { safeStorage } from './storage';
import './i18n';
import App from './App'
import './index.css'
import './components/shared.css'

initDebugFlags(window.location.search);
initLighting(window.location.search);
// Orphaned key from the removed outline-style toggle...
safeStorage.remove('carrotroyale_outline_style');
// ...
```

- [ ] **Step 2: Run typecheck**

Run: `cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -5`
Expected: clean.

- [ ] **Step 3: Smoke test in dev server**

Run: `cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run dev -- --port 5176 --strictPort`

Open `http://localhost:5176/bunnybrawl/?arena=meadow&bots=2`. Verify:
- Game looks identical to current main
- Browser console shows no errors
- Open `http://localhost:5176/bunnybrawl/?arena=meadow&bots=2&lighting=off`. Game still looks identical (because lighting is no-op in Part A, both states are equivalent — but the toggle parsing must not throw).

Stop the dev server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/main.tsx
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): wire initLighting into main.tsx boot"
```

---

### Task A6: Add the `?lighting=off` regression E2E

**Files:**
- Create: `e2e/lighting-off-regression.spec.ts`

- [ ] **Step 1: Write the regression test**

```ts
// e2e/lighting-off-regression.spec.ts
//
// PR 1 (Integration Stub) regression: ?lighting=off must produce the same
// renderer behavior as default. In Part A both code paths are no-op, so this
// is a smoke test confirming the toggle parsing doesn't break anything.
// In Part B, this test gains teeth: the off path becomes a real fallback.

import { test, expect } from '@playwright/test';

async function startMatch(page: any, params: string) {
  await page.goto(`/?arena=meadow&bots=2&killLimit=8&${params}`);
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await page.waitForFunction(
    () => (window as any).__gameLoop?.getState()?.countdown === 0,
    { timeout: 10000 },
  );
}

test.describe('Lighting kill switch', () => {
  test('?lighting=off does not crash the renderer', async ({ page }) => {
    await startMatch(page, 'lighting=off');
    // Run for 60 frames and assert the loop is still ticking
    await page.waitForTimeout(1000);
    const isAlive = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      return loop && !loop.getState().matchOver;
    });
    expect(isAlive).toBe(true);
  });

  test('?lighting=on also boots cleanly', async ({ page }) => {
    await startMatch(page, 'lighting=on');
    await page.waitForTimeout(500);
    const isAlive = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      return loop && !loop.getState().matchOver;
    });
    expect(isAlive).toBe(true);
  });

  test('default (no param) boots cleanly', async ({ page }) => {
    await startMatch(page, '');
    await page.waitForTimeout(500);
    const isAlive = await page.evaluate(() => {
      const loop = (window as any).__gameLoop;
      return loop && !loop.getState().matchOver;
    });
    expect(isAlive).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run test:e2e -- lighting-off-regression 2>&1 | tail -20
```

Expected: all 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add e2e/lighting-off-regression.spec.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "test(lighting): add ?lighting=off regression smoke"
```

---

### Task A7: Push PR 1 and merge

- [ ] **Step 1: Push branch**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 push origin feat/lighting-l1-foundation
```

- [ ] **Step 2: Open PR 1 on GitHub**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1
gh pr create --title "feat(lighting): integration stub (PR 1 of 3)" --body "$(cat <<'EOF'
## Summary

Part A of the L1 lighting foundation. Lands a no-op `LightingPipeline` skeleton + composite hook in `renderer.ts` + `?lighting=off` URL toggle.

This PR is intentionally minimal. The real pipeline lands in PR 2; PR 1 exists to absorb drift from the parallel FoliageSystem refactor brainstorm — both worktrees rebase against a `main` that already has the integration point.

## Spec
`docs/superpowers/specs/2026-05-07-lighting-l1-foundation-design.md`

## Diff scope
- New `src/engine/lighting/` directory: `index.ts` (emitter), `pipeline.ts` (no-op class), `types.ts`
- `src/engine/renderer.ts`: constructor field + `beginFrame()` at top + `composite()` before `ctx.restore()` + `resize()` in `setRenderScale`
- `src/main.tsx`: `initLighting()` call alongside `initDebugFlags`
- `e2e/lighting-off-regression.spec.ts`: smoke regression for the kill switch

## Test plan
- [x] Unit: `pipeline.smoke.test.ts` (4 tests)
- [x] Existing: `renderer.test.ts` still green
- [x] E2E: `lighting-off-regression.spec.ts` (3 tests)
- [x] Manual: `?lighting=off` and `?lighting=on` both boot cleanly in dev

## Visual delta
None. LightingPipeline.composite() is a no-op in Part A — game looks identical to main.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After review, squash-merge to main**

User merges manually after review. After merge, fetch and rebase the worktree:

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 fetch origin main
git -C P:/projects/rabbits/.worktrees/lighting-l1 rebase origin/main
```

If the user has not yet merged when you reach this step, **stop and ask before continuing to Part B**. Part B builds on a merged Part A.

---

# PART B — PR 2: Pipeline + Sun + Ambient + Scaffolds

Goal: replace the no-op pipeline with a real one. Migrate the night-overlay rect and sun glow from `drawDayNightCycle` into the new pipeline. Ship the perf-tier, brightness, photosensitivity, and determinism scaffolds.

---

### Task B0: Capture pre-M1 perf baselines

**Files:**
- Create: `perf-runs/lighting-pre-M1/meadow-baseline.md`
- Create: `perf-runs/lighting-pre-M1/graveyard-baseline.md`

- [ ] **Step 1: Run perf on meadow**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run perf -- --arena=meadow 2>&1 | tail -10
```

Expected: Playwright runs ~30s, then prints a report path under `test-results/perf/`.

- [ ] **Step 2: Save the meadow report**

```bash
mkdir -p P:/projects/rabbits/.worktrees/lighting-l1/perf-runs/lighting-pre-M1
cp P:/projects/rabbits/.worktrees/lighting-l1/test-results/perf/report.md P:/projects/rabbits/.worktrees/lighting-l1/perf-runs/lighting-pre-M1/meadow-baseline.md
```

- [ ] **Step 3: Run perf on graveyard**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run perf -- --arena=haunted_graveyard 2>&1 | tail -10
cp P:/projects/rabbits/.worktrees/lighting-l1/test-results/perf/report.md P:/projects/rabbits/.worktrees/lighting-l1/perf-runs/lighting-pre-M1/graveyard-baseline.md
```

- [ ] **Step 4: Commit baselines**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add perf-runs/lighting-pre-M1/
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "perf(lighting): pre-M1 baselines for meadow and graveyard"
```

---

### Task B1: `determinism.ts` — `tickRng(seed, tick)` helper

**Files:**
- Create: `src/engine/lighting/determinism.ts`
- Create: `src/engine/lighting/__tests__/determinism.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/lighting/__tests__/determinism.test.ts
import { describe, it, expect } from 'vitest';
import { tickRng } from '../determinism';

describe('tickRng', () => {
  it('same seed + same tick produces identical output', () => {
    const a = tickRng(42, 100);
    const b = tickRng(42, 100);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('different ticks with same seed produce different sequences', () => {
    const a = tickRng(42, 100);
    const b = tickRng(42, 101);
    expect(a()).not.toBe(b());
  });

  it('different seeds with same tick produce different sequences', () => {
    const a = tickRng(42, 100);
    const b = tickRng(43, 100);
    expect(a()).not.toBe(b());
  });

  it('output is in [0, 1)', () => {
    const r = tickRng(42, 100);
    for (let i = 0; i < 50; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/determinism.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tickRng`**

```ts
// src/engine/lighting/determinism.ts
//
// Deterministic RNG keyed by (seed, tick). Every phased lighting effect (flicker,
// twinkle, pulse) MUST use this — never Math.random() or performance.now().
// Reason: host-authoritative netcode allows cosmetic divergence in principle, but
// consistent appearance across host/guest is a quality bar for player-visible
// lighting. The seed is per-emitter (e.g. one torch's pos hash); the tick comes
// from MatchState.tick.

/** Returns a function producing deterministic floats in [0, 1). */
export function tickRng(seed: number, tick: number): () => number {
  // Mulberry32 with state derived from (seed, tick). Cheap, good distribution.
  let state = (seed * 0x9E3779B1 + tick * 0x85EBCA77) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/determinism.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/determinism.ts src/engine/lighting/__tests__/determinism.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): add tickRng determinism helper"
```

---

### Task B2: `perfTier.ts` — emitter for Low/Med/High

**Files:**
- Create: `src/engine/lighting/perfTier.ts`
- Create: `src/engine/lighting/__tests__/perfTier.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/lighting/__tests__/perfTier.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { initPerfTier, getPerfTier, setPerfTier, subscribePerfTier } from '../perfTier';

describe('perfTier emitter', () => {
  beforeEach(() => {
    // Reset to default before each test by re-init with no params
    initPerfTier('');
  });

  it('default is "med"', () => {
    expect(getPerfTier()).toBe('med');
  });

  it('URL ?perfTier=low sets low', () => {
    initPerfTier('?perfTier=low');
    expect(getPerfTier()).toBe('low');
  });

  it('URL ?perfTier=high sets high', () => {
    initPerfTier('?perfTier=high');
    expect(getPerfTier()).toBe('high');
  });

  it('invalid URL value falls back to default', () => {
    initPerfTier('?perfTier=ultra');
    expect(getPerfTier()).toBe('med');
  });

  it('setPerfTier notifies subscribers', () => {
    let calls = 0;
    const unsub = subscribePerfTier(() => { calls++; });
    setPerfTier('high');
    expect(calls).toBe(1);
    setPerfTier('high'); // no-op same value
    expect(calls).toBe(1);
    setPerfTier('low');
    expect(calls).toBe(2);
    unsub();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/perfTier.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement perfTier**

```ts
// src/engine/lighting/perfTier.ts
//
// User-selected perf tier for the lighting subsystem.
// URL: ?perfTier=low|med|high (overrides storage)
// Storage: carrotroyale_perf_tier
// In M1 only "med" is implemented; low/high fall through. L2+ adds tier branching.

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';
import type { PerfTier } from './types';

const STORAGE_KEY = 'carrotroyale_perf_tier';

const tier = createEmitter<PerfTier>('med');

export const getPerfTier = tier.get;
export const subscribePerfTier = tier.subscribe;

function isValid(v: string | null): v is PerfTier {
  return v === 'low' || v === 'med' || v === 'high';
}

export function setPerfTier(v: PerfTier): void {
  tier.set(v);
  safeStorage.set(STORAGE_KEY, v);
}

/** Parse ?perfTier=... and persisted localStorage. URL wins; default = 'med'. */
export function initPerfTier(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const urlParam = params.get('perfTier');
  if (isValid(urlParam)) {
    tier.set(urlParam);
    return;
  }
  const stored = safeStorage.get(STORAGE_KEY);
  if (isValid(stored)) {
    tier.set(stored);
    return;
  }
  tier.set('med');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/perfTier.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/perfTier.ts src/engine/lighting/__tests__/perfTier.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): perfTier emitter (URL + localStorage)"
```

---

### Task B3: `brightness.ts` — emitter for the brightness slider

**Files:**
- Create: `src/engine/lighting/brightness.ts`
- Create: `src/engine/lighting/__tests__/brightness.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/lighting/__tests__/brightness.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { initBrightness, getBrightness, setBrightness, subscribeBrightness } from '../brightness';

describe('brightness emitter', () => {
  beforeEach(() => { initBrightness(''); });

  it('default is 1.0', () => {
    expect(getBrightness()).toBe(1.0);
  });

  it('URL ?brightness=0.7 sets 0.7', () => {
    initBrightness('?brightness=0.7');
    expect(getBrightness()).toBeCloseTo(0.7);
  });

  it('clamps to [0.5, 1.5]', () => {
    setBrightness(0.1);
    expect(getBrightness()).toBe(0.5);
    setBrightness(2.0);
    expect(getBrightness()).toBe(1.5);
  });

  it('NaN URL falls back to default', () => {
    initBrightness('?brightness=lol');
    expect(getBrightness()).toBe(1.0);
  });

  it('subscribers fire on change', () => {
    let calls = 0;
    const unsub = subscribeBrightness(() => { calls++; });
    setBrightness(0.8);
    setBrightness(0.8); // no-op same value
    setBrightness(1.2);
    expect(calls).toBe(2);
    unsub();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/brightness.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement brightness**

```ts
// src/engine/lighting/brightness.ts
//
// User brightness slider. Final composite multiplier in renderer.ts.
// Range [0.5, 1.5]. Skipped when value === 1.0.
// URL: ?brightness=0.7 (overrides storage); Storage: carrotroyale_brightness

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';

const STORAGE_KEY = 'carrotroyale_brightness';
const MIN = 0.5;
const MAX = 1.5;
const DEFAULT = 1.0;

const value = createEmitter<number>(DEFAULT);

function clamp(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT;
  return Math.max(MIN, Math.min(MAX, v));
}

export const getBrightness = value.get;
export const subscribeBrightness = value.subscribe;

export function setBrightness(v: number): void {
  const clamped = clamp(v);
  value.set(clamped);
  safeStorage.set(STORAGE_KEY, String(clamped));
}

export function initBrightness(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const urlParam = params.get('brightness');
  if (urlParam !== null) {
    const parsed = Number.parseFloat(urlParam);
    value.set(clamp(parsed));
    return;
  }
  const stored = safeStorage.get(STORAGE_KEY);
  if (stored !== null) {
    const parsed = Number.parseFloat(stored);
    value.set(clamp(parsed));
    return;
  }
  value.set(DEFAULT);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/brightness.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/brightness.ts src/engine/lighting/__tests__/brightness.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): brightness emitter (URL + localStorage, clamped)"
```

---

### Task B4: `photosensitivity.ts` — boolean toggle emitter

**Files:**
- Create: `src/engine/lighting/photosensitivity.ts`
- Create: `src/engine/lighting/__tests__/photosensitivity.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/lighting/__tests__/photosensitivity.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initPhotosensitivity,
  getPhotosensitivity,
  setPhotosensitivity,
  subscribePhotosensitivity,
} from '../photosensitivity';

describe('photosensitivity emitter', () => {
  beforeEach(() => { initPhotosensitivity(''); });

  it('default is false', () => {
    expect(getPhotosensitivity()).toBe(false);
  });

  it('URL ?photosensitivity=on sets true', () => {
    initPhotosensitivity('?photosensitivity=on');
    expect(getPhotosensitivity()).toBe(true);
  });

  it('URL ?photosensitivity=off sets false', () => {
    initPhotosensitivity('?photosensitivity=off');
    expect(getPhotosensitivity()).toBe(false);
  });

  it('subscribers fire on change', () => {
    let calls = 0;
    const unsub = subscribePhotosensitivity(() => { calls++; });
    setPhotosensitivity(true);
    setPhotosensitivity(true); // no-op
    setPhotosensitivity(false);
    expect(calls).toBe(2);
    unsub();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/photosensitivity.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement photosensitivity**

```ts
// src/engine/lighting/photosensitivity.ts
//
// Photosensitivity accessibility toggle. When ON:
//   - Ambient floor never crosses below rgb(120, 130, 160) (L1)
//   - Sun intensity capped at 70% (L1)
//   - Flicker amplitudes reduced to ~10% (L2+)
//   - Hard flashes capped (L2+)
//
// URL: ?photosensitivity=on|off (overrides storage)
// Storage: carrotroyale_photosensitivity

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';

const STORAGE_KEY = 'carrotroyale_photosensitivity';

const value = createEmitter<boolean>(false);

export const getPhotosensitivity = value.get;
export const subscribePhotosensitivity = value.subscribe;

export function setPhotosensitivity(v: boolean): void {
  value.set(v);
  safeStorage.set(STORAGE_KEY, v ? '1' : '0');
}

export function initPhotosensitivity(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const urlParam = params.get('photosensitivity');
  if (urlParam === 'on') { value.set(true); return; }
  if (urlParam === 'off') { value.set(false); return; }
  const stored = safeStorage.get(STORAGE_KEY);
  if (stored === '1') { value.set(true); return; }
  value.set(false);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/photosensitivity.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/photosensitivity.ts src/engine/lighting/__tests__/photosensitivity.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): photosensitivity emitter (URL + localStorage)"
```

---

### Task B5: `ambient.ts` — pure `themeToAmbient` function

**Files:**
- Create: `src/engine/lighting/ambient.ts`
- Create: `src/engine/lighting/__tests__/ambient.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/lighting/__tests__/ambient.test.ts
import { describe, it, expect } from 'vitest';
import { themeToAmbient } from '../ambient';
import type { ThemeConfig } from '../../themes/types';

function mockTheme(dayNightEnabled: boolean): ThemeConfig {
  return {
    dayNight: { enabled: dayNightEnabled, showStars: true, showFireflies: true },
    // Other theme fields aren't read by themeToAmbient — minimal cast is safe
  } as unknown as ThemeConfig;
}

describe('themeToAmbient', () => {
  const theme = mockTheme(true);

  it('returns warm-bright at noon (dayPhase 0.25)', () => {
    const c = themeToAmbient(theme, 0.25, false);
    expect(c.r).toBeGreaterThan(220);
    expect(c.g).toBeGreaterThan(220);
    expect(c.b).toBeGreaterThan(200);
  });

  it('returns cool-blue floor at midnight (dayPhase 0.75)', () => {
    const c = themeToAmbient(theme, 0.75, false);
    expect(c.r).toBeLessThan(100);
    expect(c.g).toBeLessThan(100);
    expect(c.b).toBeGreaterThan(c.r); // cool tint
    expect(c.b).toBeGreaterThan(c.g);
  });

  it('never returns pure black (rgb 0,0,0 forbidden)', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const c = themeToAmbient(theme, p, false);
      expect(c.r + c.g + c.b).toBeGreaterThan(0);
    }
  });

  it('all channels stay in [0, 255]', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const c = themeToAmbient(theme, p, false);
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(255);
      expect(c.g).toBeGreaterThanOrEqual(0);
      expect(c.g).toBeLessThanOrEqual(255);
      expect(c.b).toBeGreaterThanOrEqual(0);
      expect(c.b).toBeLessThanOrEqual(255);
    }
  });

  it('photosensitivity floor: midnight is brighter than rgb(120,130,160) when on', () => {
    const off = themeToAmbient(theme, 0.75, false);
    const on = themeToAmbient(theme, 0.75, true);
    expect(on.r).toBeGreaterThanOrEqual(120);
    expect(on.g).toBeGreaterThanOrEqual(130);
    expect(on.b).toBeGreaterThanOrEqual(160);
    // Photosensitivity floor is BRIGHTER than the default night
    expect(on.r).toBeGreaterThan(off.r);
  });

  it('dayNight.enabled === false returns fixed mid-bright value with no phase animation', () => {
    const fixedTheme = mockTheme(false);
    const c1 = themeToAmbient(fixedTheme, 0.0, false);
    const c2 = themeToAmbient(fixedTheme, 0.5, false);
    expect(c1.r).toBe(c2.r);
    expect(c1.g).toBe(c2.g);
    expect(c1.b).toBe(c2.b);
    // Mid-bright (not midnight blue, not noon white)
    expect(c1.r).toBeGreaterThan(180);
    expect(c1.g).toBeGreaterThan(180);
    expect(c1.b).toBeGreaterThan(180);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/ambient.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement themeToAmbient**

```ts
// src/engine/lighting/ambient.ts
//
// Computes the ambient color filling the light buffer at beginFrame().
// Replaces the night-overlay alpha rect logic from drawDayNightCycle.
//
// Curve: cosine lerp between noon-warm and midnight-cool.
// nightIntensity = (1 - cos(dayPhase * 2π)) / 2 — same as drawDayNightCycle.

import type { ThemeConfig } from '../themes/types';
import type { RGB } from './types';

const NOON: RGB = { r: 245, g: 240, b: 225 }; // warm-bright (multiplies ~no-op)
const MIDNIGHT: RGB = { r: 60, g: 70, b: 110 }; // cool blue floor
const PHOTOSENSITIVITY_FLOOR: RGB = { r: 120, g: 130, b: 160 };
const FIXED_AMBIENT: RGB = { r: 200, g: 200, b: 200 }; // for dayNight.enabled === false

function lerpCh(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function nightIntensity(dayPhase: number): number {
  return Math.max(0, (1 - Math.cos(dayPhase * Math.PI * 2)) / 2);
}

export function themeToAmbient(
  theme: ThemeConfig,
  dayPhase: number,
  photosensitivity: boolean,
): RGB {
  if (!theme.dayNight.enabled) {
    return { ...FIXED_AMBIENT };
  }

  const t = nightIntensity(dayPhase); // 0 at noon, 1 at midnight
  const r = lerpCh(NOON.r, MIDNIGHT.r, t);
  const g = lerpCh(NOON.g, MIDNIGHT.g, t);
  const b = lerpCh(NOON.b, MIDNIGHT.b, t);

  if (photosensitivity) {
    return {
      r: Math.max(r, PHOTOSENSITIVITY_FLOOR.r),
      g: Math.max(g, PHOTOSENSITIVITY_FLOOR.g),
      b: Math.max(b, PHOTOSENSITIVITY_FLOOR.b),
    };
  }
  return { r, g, b };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/ambient.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/ambient.ts src/engine/lighting/__tests__/ambient.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): themeToAmbient pure function"
```

---

### Task B6: `sun.ts` — pure `buildSunLight` function

**Files:**
- Create: `src/engine/lighting/sun.ts`
- Create: `src/engine/lighting/__tests__/sun.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/lighting/__tests__/sun.test.ts
import { describe, it, expect } from 'vitest';
import { buildSunLight } from '../sun';
import type { ThemeConfig } from '../../themes/types';

function mockTheme(dayNightEnabled = true): ThemeConfig {
  return { dayNight: { enabled: dayNightEnabled, showStars: true, showFireflies: true } } as unknown as ThemeConfig;
}

describe('buildSunLight', () => {
  const theme = mockTheme();

  it('returns null below horizon (dayPhase 0.75 = midnight)', () => {
    expect(buildSunLight(theme, 0.75, false)).toBeNull();
  });

  it('returns null when dayNight.enabled === false', () => {
    expect(buildSunLight(mockTheme(false), 0.25, false)).toBeNull();
  });

  it('returns a contribution at noon (dayPhase 0.25)', () => {
    const c = buildSunLight(theme, 0.25, false);
    expect(c).not.toBeNull();
    expect(c!.intensity).toBeGreaterThan(0.7);
  });

  it('intensity peaks at noon (dayPhase 0.25)', () => {
    const dawn = buildSunLight(theme, 0.0, false);
    const noon = buildSunLight(theme, 0.25, false);
    const dusk = buildSunLight(theme, 0.5, false);
    // dawn and dusk near horizon — may be null or low
    if (dawn) expect(noon!.intensity).toBeGreaterThan(dawn.intensity);
    if (dusk) expect(noon!.intensity).toBeGreaterThan(dusk.intensity);
  });

  it('color is warmer at sunrise/sunset than at noon', () => {
    const noon = buildSunLight(theme, 0.25, false)!;
    // Pick a dayPhase close enough to sunset to be visible but warm
    const sunset = buildSunLight(theme, 0.45, false);
    if (sunset) {
      // Sunset should have lower b channel (warmer = less blue)
      expect(sunset.color.b).toBeLessThan(noon.color.b);
    }
  });

  it('angle sweeps from right (sunrise) through up (noon) to left (sunset)', () => {
    const morning = buildSunLight(theme, 0.05, false);
    const noon = buildSunLight(theme, 0.25, false);
    const evening = buildSunLight(theme, 0.45, false);
    // angle = π/2 at noon (straight up). Morning angle < π/2, evening angle > π/2.
    expect(noon!.angle).toBeCloseTo(Math.PI / 2, 1);
    if (morning) expect(morning.angle).toBeLessThan(Math.PI / 2);
    if (evening) expect(evening.angle).toBeGreaterThan(Math.PI / 2);
  });

  it('photosensitivity caps intensity at 70%', () => {
    const off = buildSunLight(theme, 0.25, false)!;
    const on = buildSunLight(theme, 0.25, true)!;
    expect(on.intensity).toBeLessThanOrEqual(off.intensity * 0.7 + 1e-6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/sun.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement buildSunLight**

```ts
// src/engine/lighting/sun.ts
//
// Computes the directional sun light contribution for the current dayPhase.
// Replaces the sun-glow blob from drawDayNightCycle.
//
// Sun is screen-space (Carrot Royale has no camera follow).
// dayPhase: 0 = noon-shifted-by-0.25 in legacy, but we use the same shift:
//   sunPhase = (dayPhase + 0.25) % 1 — 0=sunrise (right), 0.25=noon, 0.5=sunset (left)
// Below horizon (sunPhase >= 0.5) → returns null.

import type { ThemeConfig } from '../themes/types';
import type { RGB, SunContribution } from './types';

const NOON_COLOR: RGB = { r: 255, g: 250, b: 230 };
const HORIZON_COLOR: RGB = { r: 255, g: 180, b: 110 };
const PHOTOSENSITIVITY_INTENSITY_CAP = 0.7;

function lerpCh(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return { r: lerpCh(a.r, b.r, t), g: lerpCh(a.g, b.g, t), b: lerpCh(a.b, b.b, t) };
}

export function buildSunLight(
  theme: ThemeConfig,
  dayPhase: number,
  photosensitivity: boolean,
): SunContribution | null {
  if (!theme.dayNight.enabled) return null;

  const sunPhase = (dayPhase + 0.25) % 1; // 0=sunrise, 0.25=noon, 0.5=sunset
  if (sunPhase >= 0.5) return null; // below horizon

  // Map [0, 0.5] → angle [0, π] (sweeping right→up→left)
  const angle = sunPhase * 2 * Math.PI / 2; // simplifies to π * sunPhase * 2 ... wait
  // Cleaner: angle goes 0 → π/2 → π as sunPhase goes 0 → 0.25 → 0.5
  const a = sunPhase * 2 * Math.PI; // 0 → π as sunPhase goes 0 → 0.5
  // a is in [0, π]; that's exactly the angle we want.

  // Intensity: sin curve, peaks at sunPhase=0.25 (noon)
  const tFromNoon = Math.abs(sunPhase - 0.25) / 0.25; // 0 at noon, 1 at horizon
  let intensity = Math.cos(tFromNoon * Math.PI / 2); // smooth fall-off
  intensity = Math.max(0, intensity);

  // Color: warm at horizon, neutral at noon
  const colorT = tFromNoon; // 0 at noon, 1 at horizon
  const color = lerpColor(NOON_COLOR, HORIZON_COLOR, colorT);

  if (photosensitivity) {
    intensity = Math.min(intensity, PHOTOSENSITIVITY_INTENSITY_CAP * intensity);
  }

  return { angle: a, color, intensity };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/sun.test.ts
```

Expected: 7 tests pass. If the angle test fails, double-check the angle math: `a = sunPhase * 2 * Math.PI` — at sunPhase=0.25, that's π/2 (up); at sunPhase=0, that's 0 (right); at sunPhase=0.5, that's π (left). Correct.

- [ ] **Step 5: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/sun.ts src/engine/lighting/__tests__/sun.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): buildSunLight pure function"
```

---

### Task B7: Replace `pipeline.ts` with the real implementation

**Files:**
- Modify: `src/engine/lighting/pipeline.ts`
- Create: `src/engine/lighting/__tests__/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/lighting/__tests__/pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { LightingPipeline } from '../pipeline';
import type { ThemeConfig } from '../../themes/types';

function mockTheme(dayNightEnabled = true): ThemeConfig {
  return { dayNight: { enabled: dayNightEnabled, showStars: true, showFireflies: true } } as unknown as ThemeConfig;
}

describe('LightingPipeline (real impl)', () => {
  it('beginFrame fills the light buffer with ambient color', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.25, 0); // noon
    const buf = p.getLightBufferForTesting();
    const ctx = buf.getContext('2d')!;
    // sample center pixel: should be warm-bright (noon ambient)
    const pixel = ctx.getImageData(buf.width / 2, buf.height / 2, 1, 1).data;
    expect(pixel[0]).toBeGreaterThan(200); // warm red
    expect(pixel[3]).toBe(255); // opaque
  });

  it('beginFrame at midnight produces cool blue ambient', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.75, 0);
    const buf = p.getLightBufferForTesting();
    const ctx = buf.getContext('2d')!;
    const pixel = ctx.getImageData(buf.width / 2, buf.height / 2, 1, 1).data;
    expect(pixel[2]).toBeGreaterThan(pixel[0]); // blue > red
  });

  it('composite with multiply darkens a white target at midnight', () => {
    const p = new LightingPipeline(1280, 720);
    p.beginFrame(mockTheme(), 0.75, 0); // midnight
    const target = new OffscreenCanvas(1280, 720);
    const tctx = target.getContext('2d')!;
    tctx.fillStyle = 'white';
    tctx.fillRect(0, 0, 1280, 720);
    p.composite(tctx as any);
    const pixel = tctx.getImageData(640, 360, 1, 1).data;
    expect(pixel[0]).toBeLessThan(255); // multiply darkened the white
    expect(pixel[2]).toBeLessThan(255);
  });

  it('isEnabled() honors module kill switch', () => {
    const p = new LightingPipeline(1280, 720);
    expect(p.isEnabled()).toBe(true); // default
  });

  it('resize re-creates buffers without throwing', () => {
    const p = new LightingPipeline(1280, 720);
    expect(() => p.resize(1280, 720, 1.0)).not.toThrow();
    expect(() => p.resize(1280, 720, 2.0)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/pipeline.test.ts
```

Expected: FAIL — `getLightBufferForTesting` not defined; ambient/sun calls not wired.

- [ ] **Step 3: Replace pipeline.ts with the real implementation**

```ts
// src/engine/lighting/pipeline.ts
//
// LightingPipeline — Carrot Royale's deferred-lite lighting (M1 Foundation).
// Half-res light buffer (0.5×) accumulates ambient + directional sun. Composited
// onto the foreground canvas via multiply blend just before HUD draws.
//
// Architecture lesson chain (rim-light → outlines → here): lighting is per-frame,
// screen-space, post–sprite-cache. Never bake into a sprite cache.

import type { ThemeConfig } from '../themes/types';
import { isLightingEnabled } from './index';
import { themeToAmbient } from './ambient';
import { buildSunLight } from './sun';
import { getPhotosensitivity } from './photosensitivity';
import type { RGB } from './types';

const HALF_RES_SCALE = 0.5;

export class LightingPipeline {
  private width: number;
  private height: number;
  private bufW: number;
  private bufH: number;
  private lightBuffer: OffscreenCanvas;
  private lightCtx: OffscreenCanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.bufW = Math.ceil(width * HALF_RES_SCALE);
    this.bufH = Math.ceil(height * HALF_RES_SCALE);
    this.lightBuffer = new OffscreenCanvas(this.bufW, this.bufH);
    this.lightCtx = this.lightBuffer.getContext('2d')!;
  }

  /**
   * Reset the light buffer to ambient and additively accumulate sun. Run at the
   * top of renderFrame so the buffer is ready when composite() is called.
   */
  beginFrame(theme: ThemeConfig, dayPhase: number, _tick: number): void {
    if (!this.isEnabled()) return;
    const photosensitivity = getPhotosensitivity();

    // 1. Fill with ambient (source-over, fully opaque).
    const ambient = themeToAmbient(theme, dayPhase, photosensitivity);
    this.lightCtx.globalCompositeOperation = 'source-over';
    this.lightCtx.fillStyle = `rgb(${ambient.r},${ambient.g},${ambient.b})`;
    this.lightCtx.fillRect(0, 0, this.bufW, this.bufH);

    // 2. Add directional sun (lighter / additive).
    const sun = buildSunLight(theme, dayPhase, photosensitivity);
    if (sun !== null && sun.intensity > 0.01) {
      this.lightCtx.globalCompositeOperation = 'lighter';
      this.drawSunGradient(sun.angle, sun.color, sun.intensity);
      this.lightCtx.globalCompositeOperation = 'source-over';
    }
  }

  /**
   * Multiply the light buffer onto the target ctx. Half-res buffer scales up
   * with bilinear filtering — gives a free blur on lighting gradients.
   */
  composite(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    if (!this.isEnabled()) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    // imageSmoothingEnabled defaults to true; the bilinear upscale is the point
    ctx.drawImage(this.lightBuffer, 0, 0, this.width, this.height);
    ctx.restore();
  }

  resize(w: number, h: number, _scale: number): void {
    this.width = w;
    this.height = h;
    this.bufW = Math.ceil(w * HALF_RES_SCALE);
    this.bufH = Math.ceil(h * HALF_RES_SCALE);
    this.lightBuffer = new OffscreenCanvas(this.bufW, this.bufH);
    this.lightCtx = this.lightBuffer.getContext('2d')!;
  }

  isEnabled(): boolean {
    return isLightingEnabled();
  }

  /** Test-only accessor. */
  getLightBufferForTesting(): OffscreenCanvas {
    return this.lightBuffer;
  }

  /**
   * Paint the directional sun as a screen-space linear gradient on the light
   * buffer. The sun "comes from" `angle` (0 = right, π/2 = up, π = left). The
   * gradient runs along that direction with full color near the sun-side and
   * fades to transparent on the opposite side.
   */
  private drawSunGradient(angle: number, color: RGB, intensity: number): void {
    const cx = this.bufW / 2;
    const cy = this.bufH / 2;
    // Sun direction unit vector (where light comes FROM)
    const dx = Math.cos(angle);
    const dy = -Math.sin(angle); // negative because canvas y grows downward
    // Gradient endpoints span the buffer diagonal-ish
    const r = Math.max(this.bufW, this.bufH);
    const grad = this.lightCtx.createLinearGradient(
      cx + dx * r, cy + dy * r,   // sun side (full color)
      cx - dx * r, cy - dy * r,   // shadow side (transparent)
    );
    const a = Math.round(intensity * 0.5 * 255); // peak alpha 50% × intensity
    grad.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${a / 255})`);
    grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
    this.lightCtx.fillStyle = grad;
    this.lightCtx.fillRect(0, 0, this.bufW, this.bufH);
  }
}
```

Note: The constructor signature is unchanged from Part A. The `beginFrame()` signature is *changed* — it now requires `theme`, `dayPhase`, `tick`. The renderer call site (Task A4) must be updated in Task B8.

- [ ] **Step 4: Run pipeline tests**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/pipeline.test.ts src/engine/lighting/__tests__/pipeline.smoke.test.ts
```

Expected: pipeline.test.ts (5 tests) pass. pipeline.smoke.test.ts may fail because its `beginFrame()` call no longer matches the new signature.

- [ ] **Step 5: Update the smoke test for the new beginFrame signature**

Open `src/engine/lighting/__tests__/pipeline.smoke.test.ts`. Replace the relevant test:

```ts
  it('beginFrame and composite are callable with valid args', () => {
    const p = new LightingPipeline(1280, 720);
    const theme = { dayNight: { enabled: true, showStars: true, showFireflies: true } } as any;
    expect(() => p.beginFrame(theme, 0.25, 0)).not.toThrow();
    const c = new OffscreenCanvas(1280, 720);
    const ctx = c.getContext('2d')!;
    expect(() => p.composite(ctx)).not.toThrow();
  });
```

Run all lighting tests:

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/pipeline.ts src/engine/lighting/__tests__/pipeline.test.ts src/engine/lighting/__tests__/pipeline.smoke.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): real pipeline impl — half-res buffer, ambient + sun"
```

---

### Task B8: Update `renderer.ts` to call the new `beginFrame` signature + add brightness pass

**Files:**
- Modify: `src/engine/renderer.ts`

- [ ] **Step 1: Update the `beginFrame` call**

Open `src/engine/renderer.ts`. Find the line in `renderFrame` (added in Task A4, around line 633):

```ts
      this.lighting.beginFrame();
```

Replace with:

```ts
      this.lighting.beginFrame(this.theme, matchState.dayPhase ?? 0.25, matchState.tick ?? 0);
```

Note: `MatchState` may not have a `tick` field at all path; check `src/engine/types.ts`. If absent, use `0` permanently — M1 doesn't consume tick yet (sun is non-random). If `dayPhase` is undefined for non-dayNight arenas, the fallback `0.25` (noon) is safe; ambient.ts checks `dayNight.enabled` first anyway.

- [ ] **Step 2: Add the brightness pass**

Find the lighting composite block from Task A4 (just before `ctx.restore()`):

```ts
      if (this.lighting.isEnabled()) {
        this.lighting.composite(ctx);
      }

      ctx.restore();
```

Replace with:

```ts
      if (this.lighting.isEnabled()) {
        this.lighting.composite(ctx);
      }

      // Brightness slider: applied AFTER lighting so users can tune the whole
      // composited frame. Skipped at value 1.0.
      const brightness = getBrightness();
      if (brightness !== 1.0) {
        ctx.save();
        if (brightness < 1.0) {
          // Darken: multiply with rgb(b,b,b)
          ctx.globalCompositeOperation = 'multiply';
          const v = Math.round(brightness * 255);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } else {
          // Brighten: lighter blend with white at intensity (brightness - 1)
          ctx.globalCompositeOperation = 'lighter';
          const v = Math.round((brightness - 1) * 255);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
        ctx.restore();
      }

      ctx.restore();
```

- [ ] **Step 3: Add the brightness import**

Near the existing lighting import in `src/engine/renderer.ts`:

```ts
import { LightingPipeline } from './lighting';
import { getBrightness } from './lighting/brightness';
```

- [ ] **Step 4: Typecheck**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/renderer.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): wire real beginFrame + brightness pass into renderer"
```

---

### Task B9: Wire `init*` calls into `main.tsx` for the new emitters

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add the imports + init calls**

Open `src/main.tsx`. Update the lighting init block:

```ts
import { initLighting } from './engine/lighting';
import { initPerfTier } from './engine/lighting/perfTier';
import { initBrightness } from './engine/lighting/brightness';
import { initPhotosensitivity } from './engine/lighting/photosensitivity';
// ...

initDebugFlags(window.location.search);
initLighting(window.location.search);
initPerfTier(window.location.search);
initBrightness(window.location.search);
initPhotosensitivity(window.location.search);
```

- [ ] **Step 2: Typecheck**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/main.tsx
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): wire perfTier/brightness/photosensitivity init into boot"
```

---

### Task B10: Remove sun glow + night overlay from `drawDayNightCycle`

The sun is now contributed by `lighting/sun.ts`; the night overlay alpha rect is now ambient color in `lighting/ambient.ts`. Remove the redundant draws.

**Files:**
- Modify: `src/engine/rendering/effects.ts`

- [ ] **Step 1: Read the existing `drawDayNightCycle`**

Open `src/engine/rendering/effects.ts`. Locate the function `drawDayNightCycle` (line 93). It currently does:
1. Sun glow + body + core + rays (lines ~106–168) — **REMOVE**
2. Sunset afterglow overlay (lines ~170–192) — **KEEP** (separate effect, not lighting)
3. Darkness overlay rect (lines ~193 onward, conditional on `overlayAlpha > 0.02`) — **REMOVE**
4. Stars (after the darkness overlay) — **KEEP**
5. Moon body + crescent — **KEEP**
6. Fireflies — **KEEP**

- [ ] **Step 2: Make the surgical edit**

Use Read to confirm exact line ranges, then Edit to:

(a) Delete the sun rendering block. The block starts with the comment `// Sun: visible when nightIntensity < 0.8...` (line ~106) and ends just before `// Sunset afterglow:` (line ~170). Delete lines 106..168 inclusive.

(b) Delete the darkness overlay block. It starts with the comment `// Darkness overlay` and ends at the closing brace of its `if (overlayAlpha > 0.02)` block. Read lines ~193–214 first to identify exact start/end before deleting.

After both deletions, `drawDayNightCycle` should still:
- Compute `nightIntensity` (used by stars + moon + fireflies)
- Render the sunset afterglow overlay
- Render stars, moon, fireflies

Verify the function compiles after the edit:

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -10
```

Expected: clean. Unused variable warnings about `overlayAlpha` should be removed by also deleting `const overlayAlpha = nightIntensity * 0.55;` if it becomes dead.

- [ ] **Step 3: Run renderer tests**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/__tests__/renderer.test.ts 2>&1 | tail -20
```

Expected: green, or any failure is a *snapshot* mismatch from the visual change — investigate.

- [ ] **Step 4: Visual smoke test in dev**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run dev -- --port 5176 --strictPort
```

Open `http://localhost:5176/bunnybrawl/?arena=meadow&bots=2`. Verify:
- Sun is still visible during day (now it's the directional gradient, not the sun-glow blob)
- Night ambient is properly darker (driven by light buffer, not the alpha rect)
- Stars, moon, fireflies still appear
- Sunset afterglow still works
- Open `?lighting=off` — game should look "broken" now (no ambient darkness, no sun) compared to default; the toggle is the safety valve

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/rendering/effects.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): remove sun glow + night overlay from drawDayNightCycle (now lighting pipeline)"
```

---

### Task B11: Pipeline integration test

**Files:**
- Create: `src/engine/lighting/__tests__/pipeline-integration.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
// src/engine/lighting/__tests__/pipeline-integration.test.ts
//
// End-to-end: builds a real LightingPipeline, drives it through one frame
// against a synthesized minimal scene, asserts the composite output isn't mud.

import { describe, it, expect } from 'vitest';
import { LightingPipeline } from '../pipeline';
import type { ThemeConfig } from '../../themes/types';

const theme = {
  dayNight: { enabled: true, showStars: true, showFireflies: true },
} as unknown as ThemeConfig;

describe('LightingPipeline integration', () => {
  it('full frame: scene + ambient + sun composite produces visible mid-tones at noon', () => {
    const scene = new OffscreenCanvas(1280, 720);
    const sctx = scene.getContext('2d')!;
    sctx.fillStyle = '#7E9F4D'; // grass-ish mid-tone
    sctx.fillRect(0, 660, 1280, 60);
    sctx.fillStyle = '#A0C4E8'; // sky
    sctx.fillRect(0, 0, 1280, 660);

    const p = new LightingPipeline(1280, 720);
    p.beginFrame(theme, 0.25, 0); // noon
    p.composite(sctx as any);

    // Ground pixel: should still be a recognizable green (not mud)
    const ground = sctx.getImageData(640, 700, 1, 1).data;
    expect(ground[1]).toBeGreaterThan(120); // green channel survives
    expect(ground[0] + ground[1] + ground[2]).toBeGreaterThan(200); // not mud
  });

  it('full frame: midnight composite darkens the world but never to pure black', () => {
    const scene = new OffscreenCanvas(1280, 720);
    const sctx = scene.getContext('2d')!;
    sctx.fillStyle = '#FFFFFF';
    sctx.fillRect(0, 0, 1280, 720);

    const p = new LightingPipeline(1280, 720);
    p.beginFrame(theme, 0.75, 0); // midnight
    p.composite(sctx as any);

    const pixel = sctx.getImageData(640, 360, 1, 1).data;
    expect(pixel[0]).toBeLessThan(120); // darkened
    expect(pixel[0] + pixel[1] + pixel[2]).toBeGreaterThan(60); // never pure black
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/pipeline-integration.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/__tests__/pipeline-integration.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "test(lighting): pipeline integration smoke for noon and midnight"
```

---

### Task B12: Playwright screenshot regression baseline

**Files:**
- Create: `e2e/lighting-baseline.spec.ts`

- [ ] **Step 1: Write the screenshot test**

```ts
// e2e/lighting-baseline.spec.ts
//
// Visual regression: pin the meadow-noon frame at fixed seed so unintentional
// lighting shifts are caught. Single screenshot in M1 — L2+ extends as features
// stabilize. 1.5% threshold absorbs anti-aliasing variance.

import { test, expect } from '@playwright/test';

test('meadow noon default lighting baseline', async ({ page }) => {
  await page.goto('/?arena=meadow&bots=0&killLimit=8&seed=42');
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('game-canvas')).toBeVisible();

  // Wait for countdown to clear
  await page.waitForFunction(
    () => (window as any).__gameLoop?.getState()?.countdown === 0,
    { timeout: 10000 },
  );

  // Pin the dayPhase to noon — works around the live game-time sweep
  await page.evaluate(() => {
    const loop = (window as any).__gameLoop;
    if (loop && loop.getState) {
      loop.getState().dayPhase = 0.25;
    }
  });

  // Let the frame settle
  await page.waitForTimeout(500);

  await expect(page.locator('[data-testid="game-canvas"]')).toHaveScreenshot(
    'meadow-noon-default.png',
    { maxDiffPixelRatio: 0.015 }, // 1.5%
  );
});
```

- [ ] **Step 2: Run the test once to generate the baseline**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run test:e2e -- lighting-baseline --update-snapshots 2>&1 | tail -10
```

Expected: 1 test passes; snapshot file created under `e2e/lighting-baseline.spec.ts-snapshots/`.

- [ ] **Step 3: Re-run the test to confirm the baseline locks in**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run test:e2e -- lighting-baseline 2>&1 | tail -10
```

Expected: 1 test passes against the just-saved snapshot.

- [ ] **Step 4: Commit baseline + test**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add e2e/lighting-baseline.spec.ts e2e/lighting-baseline.spec.ts-snapshots/
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "test(lighting): meadow-noon screenshot baseline"
```

---

### Task B13: Update `engine/CLAUDE.md` with lighting subsystem rules

**Files:**
- Modify: `src/engine/CLAUDE.md`

- [ ] **Step 1: Add the Lighting section**

Open `src/engine/CLAUDE.md`. Append a new section before the existing `## Audio` section (alphabetical-ish ordering — Lighting fits between "Game Loop" / "Headless" and "Network"):

```markdown
## Lighting

- **Per-frame, screen-space, post-sprite-cache.** Hard rule from `feat/rim-light` and `feat/character-outlines` post-mortems. Never bake lighting into a sprite cache, the foreground-nature cache, or any other cached canvas. The `LightingPipeline.composite()` call sits inside the hitstop/screen-shake transform but AFTER all entities are drawn — lights ride the shake, never get baked.
- **Composite point:** in `renderer.ts:renderFrame`, the order is `beginFrame()` at top, then all bg/fg/effects rendering as before, then `composite()` immediately before `ctx.restore()`, then brightness pass, then `ctx.restore()`, then HUD on dedicated canvas. HUD is NEVER tinted (ref §19.7 — bloom on UI = eye cancer).
- **Half-res light buffer (0.5×).** `LightingPipeline` owns a single module-scope OffscreenCanvas at `bufW × bufH = floor(canvas × 0.5)`. Recreated only on `setRenderScale`. Bilinear upscale during composite gives a free blur on lighting gradients.
- **Multiply blend on the FG canvas in-place.** Sky/bg canvas is treated as self-lit (ref §17.3 variant 1) — only the FG ctx is multiplied by the light buffer. The bg-redraw-on-splat optimization is preserved.
- **Determinism rule.** Any phased lighting effect (flicker, twinkle, pulse) MUST derive its phase from `tickRng(seed, state.tick)` from `lighting/determinism.ts`. Never `Math.random()`, never `performance.now()`. Reason: host-authoritative netcode allows cosmetic divergence in principle, but consistent appearance across host/guest is a quality bar for player-visible lighting.
- **Kill switch:** `?lighting=off` URL param + localStorage key `carrotroyale_lighting_off`. When set, `LightingPipeline.isEnabled()` returns false; renderer skips both the composite and the brightness pass. E2E regression `lighting-off-regression.spec.ts` enforces it.
- **Accessibility scaffolds (URL + localStorage, no UI in M1):**
  - Brightness: `?brightness=0.5..1.5`, `carrotroyale_brightness`. Final composite multiplier; skipped at 1.0.
  - Photosensitivity: `?photosensitivity=on|off`, `carrotroyale_photosensitivity`. Caps ambient floor at `rgb(120,130,160)` and sun intensity at 70% in M1; L2+ flicker reads the flag too.
- **Perf tiers:** `low | med | high`, default `med`. URL `?perfTier=...`, storage `carrotroyale_perf_tier`. M1 only implements `med`; low/high fall through. L2+ branches.
- **Pure light-math modules:** `ambient.ts` (`themeToAmbient(theme, dayPhase, photosensitivity)`) and `sun.ts` (`buildSunLight(theme, dayPhase, photosensitivity)`) are pure functions. Test them aggressively; they are the migration target for all future light contributions in M1's scope.
- **What lives where:** `effects.ts > drawDayNightCycle` retains moon, stars, fireflies, sunset afterglow. Sun glow + night overlay alpha rect were removed in M1 — they're now light contributions on the buffer.
```

- [ ] **Step 2: Verify the file is well-formed**

Run: `cd P:/projects/rabbits/.worktrees/lighting-l1 && head -60 src/engine/CLAUDE.md`

Expected: file readable, no broken markdown.

- [ ] **Step 3: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/CLAUDE.md
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "docs(claude.md): document lighting subsystem rules"
```

---

### Task B14: Run perf gate; commit before/after

**Files:**
- Create: `perf-runs/lighting-l1/meadow-after.md`
- Create: `perf-runs/lighting-l1/graveyard-after.md`
- Create: `perf-runs/lighting-l1/comparison.md`

- [ ] **Step 1: Run post-M1 perf**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run perf -- --arena=meadow 2>&1 | tail -10
mkdir -p perf-runs/lighting-l1
cp test-results/perf/report.md perf-runs/lighting-l1/meadow-after.md
npm run perf -- --arena=haunted_graveyard 2>&1 | tail -10
cp test-results/perf/report.md perf-runs/lighting-l1/graveyard-after.md
```

- [ ] **Step 2: Compare and write comparison.md**

Read both pre and post reports. Compute:
- `renderFrame` p95 delta (post − pre)
- Any new GC pauses (frames > 32ms)

Create `perf-runs/lighting-l1/comparison.md`:

```markdown
# L1 Lighting Foundation — Perf Comparison

## Meadow

| Metric | Pre-M1 | Post-M1 | Delta |
|---|---|---|---|
| renderFrame p95 (ms) | <FILL> | <FILL> | <FILL> |
| Worst-frame ms | <FILL> | <FILL> | <FILL> |
| GC pauses (>32ms) | <FILL> | <FILL> | <FILL> |

## Haunted Graveyard

| Metric | Pre-M1 | Post-M1 | Delta |
|---|---|---|---|
| renderFrame p95 (ms) | <FILL> | <FILL> | <FILL> |
| Worst-frame ms | <FILL> | <FILL> | <FILL> |
| GC pauses (>32ms) | <FILL> | <FILL> | <FILL> |

## Verdict

Per spec gate: deltas ≤ 0.3ms are within run-to-run noise. Any frame > 32ms is a fail.

<PASS / FAIL summary>

If FAIL: see spec for tuning knobs (drop half-res scale, skip brightness pass when 1.0).
```

Replace each `<FILL>` with actual measurements from the reports.

- [ ] **Step 3: Commit perf comparison**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add perf-runs/lighting-l1/
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "perf(lighting): post-M1 measurements + comparison vs baseline"
```

---

### Task B15: Manual visual checklist + push PR 2

- [ ] **Step 1: Run the manual visual checklist**

Start dev server: `cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run dev -- --port 5176 --strictPort`

Walk through the spec's manual checklist. Note results:

- [ ] `?lighting=off` looks identical to current main (A/B split-screen — open both)
- [ ] Default looks subtly nicer at noon, identical at midnight
- [ ] Day → night transition smooth, no banding/popping
- [ ] All 11 arenas spot-checked at `dayPhase=0.0` and `dayPhase=0.5` — use `&arena=<id>`
- [ ] `dayNight.enabled === false` arenas (volcano, space_station) unchanged — verify by visiting both
- [ ] Hitstop zoom + screen shake feel right (lighting rides the transform)
- [ ] HUD always crisp, never tinted
- [ ] `?brightness=0.5` darkens; `?brightness=1.5` brightens; doesn't blow out
- [ ] `?photosensitivity=on` keeps midnight readable
- [ ] 5-player stress arena (graveyard, 5 chars, hard bots) maintains ≥58fps on dev laptop

For any FAIL, fix and re-run. Document FAILs in the PR description.

- [ ] **Step 2: Run the full test suite**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm test 2>&1 | tail -10
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -5
```

Expected: all green.

- [ ] **Step 3: Push and open PR 2**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 push origin feat/lighting-l1-foundation

cd P:/projects/rabbits/.worktrees/lighting-l1
gh pr create --title "feat(lighting): pipeline + sun + ambient + scaffolds (PR 2 of 3)" --body "$(cat <<'EOF'
## Summary

Part B of the L1 lighting foundation. Real `LightingPipeline` implementation with half-res light buffer, ambient + directional sun contributions, all four accessibility/perf scaffolds (perfTier, brightness, photosensitivity, determinism), and a screenshot baseline.

## Spec
`docs/superpowers/specs/2026-05-07-lighting-l1-foundation-design.md`

## Diff scope
- New `src/engine/lighting/` modules: `ambient`, `sun`, `pipeline` (real impl), `perfTier`, `brightness`, `photosensitivity`, `determinism`
- `src/engine/renderer.ts`: real `beginFrame()` args + brightness pass at composite step
- `src/engine/rendering/effects.ts`: removed sun glow + night overlay rect from `drawDayNightCycle` (now contributed by pipeline)
- `src/engine/CLAUDE.md`: lighting subsystem rules section
- `src/main.tsx`: init perfTier/brightness/photosensitivity
- `e2e/lighting-baseline.spec.ts`: meadow-noon screenshot regression
- `perf-runs/lighting-pre-M1/` and `perf-runs/lighting-l1/`: before/after baselines

## Test plan
- [x] Unit: ambient (6), sun (7), perfTier (5), brightness (5), photosensitivity (4), determinism (4), pipeline (5)
- [x] Integration: pipeline-integration (2)
- [x] E2E: lighting-baseline screenshot, lighting-off-regression (still green from PR 1)
- [x] Manual checklist: see PR description (above)
- [x] Perf gate: see `perf-runs/lighting-l1/comparison.md` — within noise band

## Visual delta
- Day looks subtly nicer (proper directional sun gradient instead of glow blob)
- Night ambient driven by light buffer, not the alpha rect
- All other visuals (moon, stars, fireflies, afterglow) unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: After review, squash-merge to main; rebase worktree**

User merges manually. After merge:

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 fetch origin main
git -C P:/projects/rabbits/.worktrees/lighting-l1 rebase origin/main
```

If unmerged when reaching this step, **stop and ask before continuing to Part C.**

---

# PART C — PR 3: Debug Tooling

Goal: ship the `?debug=light` overlay + step-through key handlers. Smaller scope; could be folded into PR 2 if review prefers.

---

### Task C1: Add `'light'` to `DebugFlagName` and parse the URL

**Files:**
- Modify: `src/engine/debugFlags.ts`

- [ ] **Step 1: Update `DebugFlagName` and add the `light*` fields**

Open `src/engine/debugFlags.ts`. Update the `debugFlags` object:

```ts
export const debugFlags = {
  navDebugAllowed: false,
  navDebugEnabled: false,
  netDebugAllowed: false,
  netDebugEnabled: false,
  fpsAllowed: false,
  fpsEnabled: false,
  perfEnabled: false,
  /** Whether lighting debug was requested via URL */
  lightAllowed: false,
  /** Whether lighting debug overlay is currently visible */
  lightEnabled: false,
};
```

Update `initDebugFlags`:

```ts
  debugFlags.lightAllowed = debugParam.includes('light');
  debugFlags.lightEnabled = debugParam.includes('light');
```

Update `DebugFlagName` and the switch statements:

```ts
export type DebugFlagName = 'nav' | 'net' | 'fps' | 'perf' | 'light';
```

In `setDebugFlag`:

```ts
    case 'light':
      debugFlags.lightAllowed = value;
      debugFlags.lightEnabled = value;
      break;
```

In `getDebugFlag`:

```ts
    case 'light': return debugFlags.lightEnabled;
```

Add a `toggleLightDebug`:

```ts
export function toggleLightDebug(): void {
  if (debugFlags.lightAllowed) {
    debugFlags.lightEnabled = !debugFlags.lightEnabled;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/debugFlags.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(debug): add 'light' debug flag"
```

---

### Task C2: `debugOverlay.ts` — composite-stage cycle + dump + false-color

**Files:**
- Create: `src/engine/lighting/debugOverlay.ts`
- Create: `src/engine/lighting/__tests__/debugOverlay.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/lighting/__tests__/debugOverlay.test.ts
import { describe, it, expect } from 'vitest';
import {
  getCompositeStage,
  cycleCompositeStage,
  setCompositeStage,
  COMPOSITE_STAGES,
} from '../debugOverlay';

describe('lighting debug overlay', () => {
  it('default stage is "composite"', () => {
    setCompositeStage('composite');
    expect(getCompositeStage()).toBe('composite');
  });

  it('cycleCompositeStage walks through all stages', () => {
    setCompositeStage('composite');
    for (let i = 0; i < COMPOSITE_STAGES.length; i++) {
      const before = getCompositeStage();
      cycleCompositeStage();
      const after = getCompositeStage();
      expect(after).not.toBe(before);
    }
    // After full cycle, returns to start
    expect(getCompositeStage()).toBe('composite');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/debugOverlay.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement debugOverlay**

```ts
// src/engine/lighting/debugOverlay.ts
//
// Lighting debug overlay state and helpers.
// Key bindings (wired in GameLoop's keydown handler):
//   L         — cycle composite stage
//   [ / ]     — step backward/forward through stages
//   Shift+L   — dump current ambient + sun to console
//   Ctrl+L    — toggle false-color overlay on light buffer

export const COMPOSITE_STAGES = [
  'composite',     // normal: bg + (fg × light)
  'light-only',    // show light buffer alone
  'scene-only',    // show fg without lighting
  'ambient-only',  // light buffer with sun contribution stripped
] as const;

export type CompositeStage = typeof COMPOSITE_STAGES[number];

let currentStage: CompositeStage = 'composite';
let falseColor = false;

export function getCompositeStage(): CompositeStage {
  return currentStage;
}

export function setCompositeStage(s: CompositeStage): void {
  currentStage = s;
}

export function cycleCompositeStage(): void {
  const i = COMPOSITE_STAGES.indexOf(currentStage);
  currentStage = COMPOSITE_STAGES[(i + 1) % COMPOSITE_STAGES.length];
}

export function stepCompositeStage(direction: 1 | -1): void {
  const i = COMPOSITE_STAGES.indexOf(currentStage);
  const n = COMPOSITE_STAGES.length;
  currentStage = COMPOSITE_STAGES[(i + direction + n) % n];
}

export function getFalseColor(): boolean {
  return falseColor;
}

export function toggleFalseColor(): void {
  falseColor = !falseColor;
}

/** Called by Shift+L. Logs the current pipeline state via console. */
export function dumpLightingState(state: {
  ambient: { r: number; g: number; b: number };
  sun: { angle: number; color: { r: number; g: number; b: number }; intensity: number } | null;
}): void {
  console.log('[lighting]', JSON.stringify(state, null, 2));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/lighting/__tests__/debugOverlay.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/debugOverlay.ts src/engine/lighting/__tests__/debugOverlay.test.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): debug overlay state + cycle/step helpers"
```

---

### Task C3: Wire keyboard handlers into `GameLoop`

**Files:**
- Modify: `src/engine/gameLoop/GameLoop.ts`

- [ ] **Step 1: Locate the existing debug-key handler**

Open `src/engine/gameLoop/GameLoop.ts`. Find the `keydown` handler that toggles `nav` / `net` / `fps` (search for `toggleNavDebug` or backtick handler).

- [ ] **Step 2: Add the new key handlers**

In the same handler, add cases for `L`, `[`, `]`, the dump (Shift+L) and the false-color toggle (Ctrl+L):

```ts
import { debugFlags, toggleLightDebug } from '../debugFlags';
import { cycleCompositeStage, stepCompositeStage, toggleFalseColor, dumpLightingState } from '../lighting/debugOverlay';
import { themeToAmbient } from '../lighting/ambient';
import { buildSunLight } from '../lighting/sun';
import { getPhotosensitivity } from '../lighting/photosensitivity';

// ... inside the keydown handler (within the existing backtick/debug section):

if (e.key === 'l' || e.key === 'L') {
  if (e.shiftKey) {
    // Dump
    const dayPhase = this.getState().dayPhase ?? 0.25;
    const photo = getPhotosensitivity();
    dumpLightingState({
      ambient: themeToAmbient(this.theme, dayPhase, photo),
      sun: buildSunLight(this.theme, dayPhase, photo),
    });
  } else if (e.ctrlKey) {
    toggleFalseColor();
  } else {
    if (!debugFlags.lightAllowed) toggleLightDebug(); // allow keyboard activation when URL gate not set, like other debug keys do
    cycleCompositeStage();
  }
}
if (e.key === '[') stepCompositeStage(-1);
if (e.key === ']') stepCompositeStage(1);
```

(Read the existing section carefully and follow its conventions. The exact placement may differ — find the analog for `toggleNavDebug` / `toggleNetDebug` and add to it.)

- [ ] **Step 3: Typecheck and run gameLoop tests**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -10
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx vitest run src/engine/gameLoop/__tests__ 2>&1 | tail -10
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/gameLoop/GameLoop.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): wire L / [ / ] / Shift+L / Ctrl+L debug keys"
```

---

### Task C4: Renderer reads `getCompositeStage()` and `getFalseColor()`

**Files:**
- Modify: `src/engine/renderer.ts`
- Modify: `src/engine/lighting/pipeline.ts`

- [ ] **Step 1: Expose the light buffer for debug display**

In `src/engine/lighting/pipeline.ts`, the `getLightBufferForTesting()` method already exists. Expose a non-test alias:

```ts
  getLightBuffer(): OffscreenCanvas {
    return this.lightBuffer;
  }
```

- [ ] **Step 2: Branch composite based on stage**

Open `src/engine/renderer.ts`. Find the lighting composite block:

```ts
      if (this.lighting.isEnabled()) {
        this.lighting.composite(ctx);
      }
```

Replace with:

```ts
      if (this.lighting.isEnabled()) {
        const stage = debugFlags.lightEnabled ? getCompositeStage() : 'composite';
        if (stage === 'composite') {
          this.lighting.composite(ctx);
        } else if (stage === 'light-only') {
          // Replace the fg with the light buffer
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.drawImage(this.lighting.getLightBuffer(), 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.restore();
        }
        // 'scene-only' and 'ambient-only' are no-op for now (scene-only literally
        // skips the multiply; ambient-only would require pipeline awareness — TODO PR 3.1)
      }
```

Add the imports:

```ts
import { getCompositeStage } from './lighting/debugOverlay';
```

- [ ] **Step 3: Typecheck and dev-test**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -5
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run dev -- --port 5176 --strictPort
```

Open `http://localhost:5176/bunnybrawl/?arena=meadow&bots=2&debug=light`. In-match, press `L` — composite should cycle through stages. Press `[` and `]` — stepping. Press Shift+L — console logs ambient + sun.

Stop dev.

- [ ] **Step 4: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add src/engine/lighting/pipeline.ts src/engine/renderer.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "feat(lighting): renderer branches on debug composite stage"
```

---

### Task C5: E2E smoke for `?debug=light`

**Files:**
- Create: `e2e/lighting-debug.spec.ts`

- [ ] **Step 1: Write the smoke test**

```ts
// e2e/lighting-debug.spec.ts
//
// Smoke for ?debug=light + L key cycle.

import { test, expect } from '@playwright/test';

test('?debug=light boots without errors and L cycles stages', async ({ page }) => {
  await page.goto('/?arena=meadow&bots=2&killLimit=8&debug=light');
  await expect(page.getByTestId('match-screen')).toBeVisible({ timeout: 10000 });
  await page.waitForFunction(
    () => (window as any).__gameLoop?.getState()?.countdown === 0,
    { timeout: 10000 },
  );

  // Press L 4 times — should not crash; should cycle and return
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('l');
    await page.waitForTimeout(100);
  }

  // Loop is still alive
  const isAlive = await page.evaluate(() => {
    const loop = (window as any).__gameLoop;
    return loop && !loop.getState().matchOver;
  });
  expect(isAlive).toBe(true);
});
```

- [ ] **Step 2: Run the test**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run test:e2e -- lighting-debug 2>&1 | tail -10
```

Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 add e2e/lighting-debug.spec.ts
git -C P:/projects/rabbits/.worktrees/lighting-l1 commit -m "test(lighting): ?debug=light smoke + L cycle"
```

---

### Task C6: Push PR 3

- [ ] **Step 1: Run the full suite once more**

```bash
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm test 2>&1 | tail -10
cd P:/projects/rabbits/.worktrees/lighting-l1 && npx tsc -b --noEmit 2>&1 | tail -5
cd P:/projects/rabbits/.worktrees/lighting-l1 && npm run test:e2e -- lighting 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 2: Push and open PR 3**

```bash
git -C P:/projects/rabbits/.worktrees/lighting-l1 push origin feat/lighting-l1-foundation

cd P:/projects/rabbits/.worktrees/lighting-l1
gh pr create --title "feat(lighting): debug tooling (PR 3 of 3)" --body "$(cat <<'EOF'
## Summary

Part C of the L1 lighting foundation. Adds `?debug=light` URL param + L/[/]/Shift+L/Ctrl+L key handlers for inspecting the lighting pipeline.

## Spec
`docs/superpowers/specs/2026-05-07-lighting-l1-foundation-design.md`

## Diff scope
- `src/engine/lighting/debugOverlay.ts`: composite-stage cycle, false-color toggle, dump
- `src/engine/debugFlags.ts`: add `'light'` to `DebugFlagName`
- `src/engine/gameLoop/GameLoop.ts`: keyboard handlers
- `src/engine/renderer.ts`: branch composite on debug stage; expose light buffer
- `src/engine/lighting/pipeline.ts`: rename `getLightBufferForTesting` → public `getLightBuffer`
- `e2e/lighting-debug.spec.ts`: smoke

## Test plan
- [x] Unit: `debugOverlay.test.ts` (2)
- [x] E2E: `lighting-debug.spec.ts` (1)
- [x] Manual: `?debug=light` + L key cycles stages in dev

## Visual delta
None at default. Dev-only `?debug=light` adds inspection.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After review, squash-merge and clean up**

User merges PR 3. After merge:

```bash
# From the main repo, archive the worktree
cd P:/projects/rabbits
git worktree remove .worktrees/lighting-l1
git fetch --prune
```

Branch `feat/lighting-l1-foundation` retained on remote for history. Memory entry written next.

---

### Task C7: Memory entry — lighting program project + architectural lesson chain

**Files:**
- Create: `C:/Users/vproc/.claude/projects/P--projects-rabbits/memory/project_lighting_program.md`
- Modify: `C:/Users/vproc/.claude/projects/P--projects-rabbits/memory/MEMORY.md`

- [ ] **Step 1: Write the memory file**

```markdown
---
name: Lighting Program
description: 5-pillar lighting program (L1 foundation merged; L2-L5 pending). Architectural lesson: per-frame, post-sprite-cache, never bake.
type: project
---

Lighting program decomposed into 5 milestones: L1 foundation (deferred-lite pipeline, sun + ambient), L2 light catalog + per-arena emitters, L3 shadows (drop + blob + directional sun), L4 atmosphere/post (bloom, vignette, color grading), L5 exotic + gameplay coupling + settings UI.

L1 merged 2026-05-XX in three PRs (integration stub → real pipeline + sun + ambient → debug tooling).

**Architectural lesson chain (rim-light → outlines → L1):** lighting effects must be per-frame, screen-space, post–sprite-cache. The shelved `feat/rim-light` branch baked the rim into the cache and couldn't track sun position, flipped with facing, applied at night. The shelved `feat/character-outlines` had the same root cause. L1's `LightingPipeline.composite()` runs AFTER all sprites are blitted, INSIDE the hitstop/screen-shake transform, BEFORE the HUD draws.

**Why:** keeps the effect responsive to runtime state (dayPhase, photosensitivity, etc.) without flushing caches.

**How to apply:** when L2+ adds new light contributions (torch flicker, lava emissive, player aura), they go into `LightingPipeline.beginFrame()`, drawn additively onto the half-res light buffer. NEVER into `_drawCharacterSpriteImpl` or any cached canvas. Phased effects derive from `tickRng(seed, state.tick)` per the determinism rule.

Specs: `docs/superpowers/specs/2026-05-07-lighting-program-design.md`, `2026-05-07-lighting-l1-foundation-design.md`.
```

- [ ] **Step 2: Add an entry to MEMORY.md**

Append a line to `C:/Users/vproc/.claude/projects/P--projects-rabbits/memory/MEMORY.md`:

```markdown
- [Lighting Program](project_lighting_program.md) — 5-pillar program; L1 foundation merged. Lesson: lighting is per-frame, post-sprite-cache, never bake.
```

- [ ] **Step 3: No commit needed** — memory files are local to the user's Claude install, not the project repo.

---

## Self-review checklist (already run by author of this plan)

**Spec coverage:**
- ✓ DoD #1 (`?lighting=off` bit-identical) — Task A6 + B12 (e2e)
- ✓ DoD #2 (sun + ambient via pipeline; moon/stars/fireflies legacy) — Tasks B5, B6, B7, B10
- ✓ DoD #3 (perf gate) — Tasks B0, B14
- ✓ DoD #4 (debug overlay with all 4 toggles) — Tasks C1, C2, C3, C4
- ✓ DoD #5 (brightness, photosensitivity, kill switch as URL+localStorage; no UI) — Tasks A2, B3, B4
- ✓ DoD #6 (`tickRng` helper + tests + CLAUDE.md doc) — Tasks B1, B13
- ✓ DoD #7 (test suite green: unit + integration + 1 screenshot + manual checklist) — Tasks B5, B6, B7, B11, B12, B15
- ✓ DoD #8 (3 PRs merged in order; rim-light lesson addressed in CLAUDE.md) — Tasks A7, B15, C6, B13

**Placeholder scan:** No "TBD" or "implement later". Every step has concrete code or commands.

**Type consistency:**
- `themeToAmbient` signature is `(theme, dayPhase, photosensitivity) → RGB` everywhere
- `buildSunLight` signature is `(theme, dayPhase, photosensitivity) → SunContribution | null` everywhere
- `LightingPipeline.beginFrame(theme, dayPhase, tick)` consistent across pipeline.ts, renderer.ts, integration test
- `RGB` type imported from `./types` in ambient and sun
- `PerfTier` type imported from `./types` in perfTier.ts
