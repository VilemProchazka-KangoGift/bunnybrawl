# Reactive Decoration System — PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foundation of the `ReactiveDecorationSystem` (4 reactivity primitives + 30/60Hz buckets + per-kind registry), migration of meadow's decorations into it, and underwater bubble trails via a new per-arena `cosmeticTick` hook.

**Architecture:** New cosmetic system implementing `CosmeticSystem`. Owns instance buckets keyed by 30/60Hz update rate. Per-kind draw functions registered globally with prefix convention (`'meadow.tree'`, `'underwater.bubble'`). Renderer dispatches via the registry in two slots — pre-player (background) and post-player (foreground) — to preserve existing z-ordering of butterflies/bees vs dandelions/trees.

**Tech Stack:** TypeScript (strict), Canvas 2D, Vitest. Touched modules: `gameLoop/cosmetics/ReactiveDecorationSystem.ts` (new), `arenas/types.ts`, `arenas/registry.ts`, `themes/types.ts`, `gameLoop/GameLoop.ts`, `renderer.ts`, `arenas/packs/meadow.ts`, `arenas/packs/underwater.ts`, plus tests.

---

## Background context

Spec: `docs/superpowers/specs/2026-05-07-reactive-decoration-system-design.md`. Read it first.

Existing structure relevant to wiring:
- `CosmeticSystem` interface in `src/engine/gameLoop/types.ts:9-13` — `init(state) / cosmeticUpdate(dt) / cleanup()`.
- `GameLoop` constructs all cosmetic systems in its constructor, again in `switchArena`. `cosmeticStep(dt)` calls each system's `cosmeticUpdate(dt)`. See `GameLoop.ts:482-514`.
- `PlayerTransitionSystem.detectPlayerTransitions` detects stomps at `playerTransitions.ts:91-100` (`prev.state !== 'splat' && player.state === 'splat'`). The stomp callback path is via `TransitionCallbacks` (line 33-42 of `playerTransitions.ts`).
- `ParticleSystem.emitParticle(x, y, vx, vy, life, size, color, shape?)` — see `ParticleSystem.ts:46-48`.
- `Renderer` calls `theme.drawAnimatedBackground` at line ~661 (pre-player), fg-nature cache blit at ~949, player layer at ~823, `drawAnimatedForeground` at ~1000 (post-player).
- `_fgNatureCache` invalidates only on arena change or render-scale change. After meadow migrates, its `drawForegroundNature` function shrinks to a near-empty stub — that's fine; cache just bakes less.
- `ArenaPack` interface in `src/engine/arenas/types.ts:23-144`. New fields go alongside `drawAnimatedForeground`.
- `ThemeConfig` (the consumer-facing extracted shape used by Renderer) is in `src/engine/themes/types.ts`. `arenas/registry.ts:toThemeConfig` is where pack fields get forwarded.
- Meadow's existing reactive entities live in `arenas/packs/meadow.ts`:
  - `drawBackgroundNature` (lines 429-471): trees, bushes, flowers, mushrooms, grass tufts.
  - `drawForegroundNature` (lines 473-515): tall grass, ferns, hanging vines, fg bushes, leaf clusters, wildflowers.
  - `drawAnimatedBackground` (lines 622-706): dandelions with proximity-driven seed burst.
  - `drawAnimatedForeground` (lines 713-720): butterflies + bees.
  - Helper data hoisted at top: `BUTTERFLY_HUES`, `BEE_CLUSTERS`, `DANDELIONS`, `FLOWER_COLORS`, etc.
- Test patterns: `gameLoop/cosmetics/surfaceImpact.test.ts` and `gameLoop/cosmetics/__tests__/ParticleSystem.thorn.test.ts` show the canonical mocking style for cosmetic systems.

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/engine/gameLoop/cosmetics/reactiveDecorations.ts` | Create | Pure helpers: `ReactiveInstance` type, kind registry, primitive math (excitement lerp, shake decay, burst edge detection). Stateless; the system module is the stateful wrapper. |
| `src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts` | Create | Class implementing `CosmeticSystem`. Owns instance buckets, windPhase, wires stomp impulses + burst → ParticleSystem. |
| `src/engine/gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts` | Create | Unit tests for system: bucketing, primitives, stomp wiring, burst edge. |
| `src/engine/gameLoop/cosmetics/__tests__/reactiveDecorations.test.ts` | Create | Unit tests for pure helpers: registry, excitement math, shake decay. |
| `src/engine/gameLoop/cosmetics/index.ts` | Modify | Export new system + helpers. |
| `src/engine/arenas/types.ts` | Modify | Add `buildReactiveDecorations` and `cosmeticTick` fields to `ArenaPack`. |
| `src/engine/arenas/registry.ts` | Modify | Forward new fields through `toThemeConfig`. |
| `src/engine/themes/types.ts` | Modify | Add `buildReactiveDecorations` and `cosmeticTick` to `ThemeConfig`. |
| `src/engine/gameLoop/GameLoop.ts` | Modify | Construct system; wire windPhase tick (fixedUpdate) + 30Hz update (cosmeticStep) + stomp transitions + arena.cosmeticTick. |
| `src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts` | Modify | Add `onStomp(x, y)` to TransitionCallbacks. |
| `src/engine/gameLoop/cosmetics/playerTransitions.ts` | Modify | Fire `cb.onStomp(...)` inside the existing stomp detection branch. |
| `src/engine/renderer.ts` | Modify | Render reactive decorations in two slots — background (after fg-nature blit, before players) and foreground (where `drawAnimatedForeground` runs). |
| `src/engine/arenas/packs/meadow.ts` | Modify | Define + register meadow kind factories/draw fns. Provide `buildReactiveDecorations`. Strip migrated draw calls from existing nature/animated hooks. |
| `src/engine/arenas/packs/underwater.ts` | Modify | Add `cosmeticTick` for bubble trails. |
| `src/engine/arenas/packs/__tests__/meadow-decorations.test.ts` | Create | Smoke test: meadow's instance list builds, every kind is registered, positions in bounds, renders at multiple windPhase slices. |
| `src/engine/arenas/packs/__tests__/underwater-bubbles.test.ts` | Create | Bubble trails fire only on underwater + only when `\|vx\| > 50` + throttled. |

---

## Task 1: Worktree setup

**Files:** none (environment).

- [ ] **Step 1: Create worktree + branch**

Run from `P:/projects/rabbits`:
```bash
git worktree add -b feat/reactive-decorations .worktrees/reactive-decorations main
```

Expected: prints `Preparing worktree (new branch 'feat/reactive-decorations')` and a checkout line. `git worktree list` should show `.worktrees/reactive-decorations  <sha> [feat/reactive-decorations]`.

- [ ] **Step 2: Verify clean state**

Run from `.worktrees/reactive-decorations`:
```bash
npx tsc -b 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 3: Confirm dev server works**

Run: `npm run dev` (background, kill after a few seconds with Ctrl-C). Expected: Vite starts on port 5173 without errors. This is a smoke check; you're not testing anything yet.

All subsequent commands run from `P:/projects/rabbits/.worktrees/reactive-decorations`.

---

## Task 2: Pure helpers — ReactiveInstance type + kind registry + primitive math

**Files:**
- Create: `src/engine/gameLoop/cosmetics/reactiveDecorations.ts`
- Create: `src/engine/gameLoop/cosmetics/__tests__/reactiveDecorations.test.ts`

The system module (Task 3+) wraps these with state. Keeping them pure makes testing easier.

- [ ] **Step 1: Write the failing test**

Create `src/engine/gameLoop/cosmetics/__tests__/reactiveDecorations.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerReactiveKind, getReactiveKind, hasReactiveKind, _resetReactiveKindsForTest,
  updateExcitement, applyShakeImpulse, decayShake, shouldFireBurst,
  type ReactiveInstance, type ReactiveKindConfig,
} from '../reactiveDecorations';

function makeInstance(overrides: Partial<ReactiveInstance> = {}): ReactiveInstance {
  return {
    pos: { x: 100, y: 600 },
    kind: 'test.x',
    seed: 1,
    excitement: 0,
    shakeDecay: 0,
    ...overrides,
  };
}

describe('reactiveDecorations — kind registry', () => {
  beforeEach(() => { _resetReactiveKindsForTest(); });

  it('registers and retrieves a kind', () => {
    const draw = () => {};
    registerReactiveKind('test.foo', { draw, layer: 'background' });
    expect(hasReactiveKind('test.foo')).toBe(true);
    const cfg = getReactiveKind('test.foo');
    expect(cfg?.draw).toBe(draw);
    expect(cfg?.layer).toBe('background');
    expect(cfg?.highFrequency).toBe(false); // default
  });

  it('overwrites on re-registration (test reload pattern)', () => {
    const a = () => {};
    const b = () => {};
    registerReactiveKind('test.foo', { draw: a, layer: 'background' });
    registerReactiveKind('test.foo', { draw: b, layer: 'foreground' });
    expect(getReactiveKind('test.foo')?.draw).toBe(b);
    expect(getReactiveKind('test.foo')?.layer).toBe('foreground');
  });

  it('returns undefined for unknown kind', () => {
    expect(getReactiveKind('test.missing')).toBeUndefined();
    expect(hasReactiveKind('test.missing')).toBe(false);
  });
});

describe('reactiveDecorations — excitement primitive', () => {
  it('rises toward 1 when within radius', () => {
    const inst = makeInstance({ proximity: { radius: 50, mode: 'excite', magnitude: 1 } });
    // Simulate 10 ticks of player at distance 30 (within radius 50)
    for (let i = 0; i < 10; i++) updateExcitement(inst, 30, 1 / 30);
    expect(inst.excitement).toBeGreaterThan(0.5);
    expect(inst.excitement).toBeLessThanOrEqual(1);
  });

  it('decays toward 0 when outside radius', () => {
    const inst = makeInstance({ proximity: { radius: 50, mode: 'excite', magnitude: 1 }, excitement: 1 });
    for (let i = 0; i < 30; i++) updateExcitement(inst, 200, 1 / 30);
    expect(inst.excitement).toBeLessThan(0.1);
  });

  it('is a no-op when proximity is undefined', () => {
    const inst = makeInstance();
    inst.excitement = 0.5;
    updateExcitement(inst, 10, 1 / 30);
    expect(inst.excitement).toBe(0.5);
  });
});

describe('reactiveDecorations — shake primitive', () => {
  it('sets shakeDecay to 1 when stomp is within shakeRadius', () => {
    const inst = makeInstance({ pos: { x: 100, y: 600 }, shakeRadius: 80 });
    applyShakeImpulse(inst, 120, 600); // distance 20 — within
    expect(inst.shakeDecay).toBe(1);
  });

  it('does not set shakeDecay when stomp is outside shakeRadius', () => {
    const inst = makeInstance({ pos: { x: 100, y: 600 }, shakeRadius: 80 });
    applyShakeImpulse(inst, 500, 600); // distance 400 — outside
    expect(inst.shakeDecay).toBe(0);
  });

  it('does not set shakeDecay when shakeRadius is undefined', () => {
    const inst = makeInstance({ pos: { x: 100, y: 600 } });
    applyShakeImpulse(inst, 100, 600);
    expect(inst.shakeDecay).toBe(0);
  });

  it('decays shakeDecay at rate 7/sec', () => {
    const inst = makeInstance({ shakeDecay: 1 });
    decayShake(inst, 1 / 30); // ~0.233 of decay
    expect(inst.shakeDecay).toBeGreaterThan(0.7);
    expect(inst.shakeDecay).toBeLessThan(0.8);
  });
});

describe('reactiveDecorations — burst trigger', () => {
  it('fires when shakeDecay rises above threshold (rising edge from 0)', () => {
    const inst = makeInstance({ burst: { threshold: 0.95, particleKind: 'petal', count: 10 }, shakeDecay: 0.95 });
    expect(shouldFireBurst(inst, 0)).toBe(true);
  });

  it('does not fire when shakeDecay was already above threshold', () => {
    const inst = makeInstance({ burst: { threshold: 0.95, particleKind: 'petal', count: 10 }, shakeDecay: 0.96 });
    expect(shouldFireBurst(inst, 0.95)).toBe(false);
  });

  it('does not fire when shakeDecay never crosses threshold', () => {
    const inst = makeInstance({ burst: { threshold: 0.95, particleKind: 'petal', count: 10 }, shakeDecay: 0.5 });
    expect(shouldFireBurst(inst, 0.4)).toBe(false);
  });

  it('does not fire when burst is undefined', () => {
    const inst = makeInstance({ shakeDecay: 1 });
    expect(shouldFireBurst(inst, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/engine/gameLoop/cosmetics/__tests__/reactiveDecorations.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `reactiveDecorations.ts`**

```typescript
// src/engine/gameLoop/cosmetics/reactiveDecorations.ts

export type ReactiveLayer = 'background' | 'foreground';

export type ProximityMode = 'flee' | 'lean' | 'excite';

export interface ReactiveInstance {
  /** World-space anchor (center for most kinds; arena packs decide). */
  pos: { x: number; y: number };
  /** Registry key — `<arenaId>.<kind>` convention. */
  kind: string;
  /** Per-instance deterministic seed for sway-phase offset, jitter, etc. */
  seed: number;

  // ---- Static reactivity opts (set by factory at registration) ----
  /** Sway amplitude in pixels. 0 / undefined = no wind sway. */
  windAmp?: number;
  proximity?: {
    radius: number;
    mode: ProximityMode;
    /** Kind-relative; the draw fn interprets it. */
    magnitude: number;
  };
  /** Stomp shake radius. Undefined = stomp-immune. */
  shakeRadius?: number;
  /** Particle burst when shakeDecay crosses threshold (rising edge). */
  burst?: { threshold: number; particleKind: string; count: number };

  // ---- Runtime-mutated state (updated by the system per tick) ----
  /** 0..1, smoothed proximity scalar. */
  excitement: number;
  /** 0..1, set on stomp impulse, decays each tick. */
  shakeDecay: number;
}

export interface ReactiveKindConfig {
  /** Per-kind draw function. Receives current swayPhase / excitement / shake. */
  draw: ReactiveDraw;
  /** Render slot — pre-player or post-player. Defaults to 'background'. */
  layer: ReactiveLayer;
  /** Update at 60Hz (fixedUpdate) instead of default 30Hz (cosmeticStep). */
  highFrequency?: boolean;
}

/**
 * Per-kind draw function. Called from Renderer once per frame per instance.
 *  - swayPhase: precomputed `sin(windPhase + seed * 0.7) * windAmp` (or 0 on slow-device).
 *  - dayPhase: 0..1, current day/night phase from MatchState.
 *  - time: matchState.timeElapsed in seconds.
 */
export type ReactiveDraw = (
  ctx: CanvasRenderingContext2D,
  instance: ReactiveInstance,
  swayPhase: number,
  time: number,
  dayPhase: number,
) => void;

// ---- Registry ----

const _kinds = new Map<string, ReactiveKindConfig>();

export function registerReactiveKind(name: string, opts: { draw: ReactiveDraw; layer: ReactiveLayer; highFrequency?: boolean }): void {
  _kinds.set(name, {
    draw: opts.draw,
    layer: opts.layer,
    highFrequency: opts.highFrequency ?? false,
  });
}

export function getReactiveKind(name: string): ReactiveKindConfig | undefined {
  return _kinds.get(name);
}

export function hasReactiveKind(name: string): boolean {
  return _kinds.has(name);
}

/** Test-only — clears the global registry. */
export function _resetReactiveKindsForTest(): void {
  _kinds.clear();
}

// ---- Primitives ----

/** Excitement lerp factor — at 30Hz, ~10-frame ease (≈0.33s). */
const EXCITEMENT_LERP = 0.08 * 30; // multiplied by dt below

/** Stomp-shake decay per second. */
export const SHAKE_DECAY_RATE = 7;

/** Update an instance's excitement based on the closest player's distance.
 *  Caller is responsible for finding the closest player and passing its distance.
 *  No-op if the instance has no proximity config. */
export function updateExcitement(instance: ReactiveInstance, distanceToNearestPlayer: number, dt: number): void {
  if (!instance.proximity) return;
  const target = distanceToNearestPlayer < instance.proximity.radius ? 1 : 0;
  // Frame-rate-independent lerp via 1 - exp(-k*dt).
  const k = EXCITEMENT_LERP * dt;
  instance.excitement += (target - instance.excitement) * Math.min(1, k);
}

/** Apply a stomp impulse: if the stomp is within `shakeRadius`, set shakeDecay to 1. */
export function applyShakeImpulse(instance: ReactiveInstance, stompX: number, stompY: number): void {
  if (instance.shakeRadius === undefined) return;
  const dx = stompX - instance.pos.x;
  const dy = stompY - instance.pos.y;
  if (dx * dx + dy * dy <= instance.shakeRadius * instance.shakeRadius) {
    instance.shakeDecay = 1;
  }
}

/** Decay shakeDecay toward 0 at SHAKE_DECAY_RATE per second. Mutates in place. */
export function decayShake(instance: ReactiveInstance, dt: number): void {
  if (instance.shakeDecay > 0) {
    instance.shakeDecay = Math.max(0, instance.shakeDecay - SHAKE_DECAY_RATE * dt);
  }
}

/** True iff `instance.shakeDecay` rose to or above the burst threshold this tick.
 *  Caller passes the previous (pre-tick) shake value. */
export function shouldFireBurst(instance: ReactiveInstance, prevShake: number): boolean {
  if (!instance.burst) return false;
  return prevShake < instance.burst.threshold && instance.shakeDecay >= instance.burst.threshold;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/engine/gameLoop/cosmetics/__tests__/reactiveDecorations.test.ts
```
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/gameLoop/cosmetics/reactiveDecorations.ts src/engine/gameLoop/cosmetics/__tests__/reactiveDecorations.test.ts
git commit -m "$(cat <<'EOF'
reactive: pure helpers — ReactiveInstance, kind registry, primitive math

Foundation for ReactiveDecorationSystem. Stateless module with the
ReactiveInstance shape, global kind registry (registerReactiveKind /
getReactiveKind), and four primitives (updateExcitement, applyShakeImpulse,
decayShake, shouldFireBurst). System module wraps these with state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: ReactiveDecorationSystem class — bucketing, init, update, cleanup

**Files:**
- Create: `src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts`
- Create: `src/engine/gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts`

System owns the bucketed instance arrays + windPhase. The 60Hz path is exposed separately so GameLoop can call it from `fixedUpdate`; the 30Hz path implements `CosmeticSystem.cosmeticUpdate`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactiveDecorationSystem } from '../ReactiveDecorationSystem';
import {
  registerReactiveKind, _resetReactiveKindsForTest,
  type ReactiveInstance,
} from '../reactiveDecorations';
import { makeArena, makeState, makePlayer } from '../../../__tests__/testHelpers';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

function inst(overrides: Partial<ReactiveInstance> = {}): ReactiveInstance {
  return {
    pos: { x: 100, y: 600 },
    kind: 'test.x',
    seed: 1,
    excitement: 0,
    shakeDecay: 0,
    ...overrides,
  };
}

describe('ReactiveDecorationSystem', () => {
  beforeEach(() => {
    _resetReactiveKindsForTest();
    registerReactiveKind('test.bg', { draw: () => {}, layer: 'background' });
    registerReactiveKind('test.fg', { draw: () => {}, layer: 'foreground' });
    registerReactiveKind('test.fast', { draw: () => {}, layer: 'background', highFrequency: true });
  });

  it('buckets instances into 30Hz vs 60Hz by their registered kind', () => {
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    sys.setInstances([
      inst({ kind: 'test.bg' }),
      inst({ kind: 'test.fg' }),
      inst({ kind: 'test.fast' }),
    ]);
    expect(sys.getInstances30Hz()).toHaveLength(2);
    expect(sys.getInstances60Hz()).toHaveLength(1);
  });

  it('advances windPhase in fixedUpdate (60Hz) and not in cosmeticUpdate', () => {
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    const before = sys.getWindPhase();
    sys.fixedUpdate(1 / 60);
    expect(sys.getWindPhase()).toBeGreaterThan(before);

    const after = sys.getWindPhase();
    sys.cosmeticUpdate(1 / 30);
    expect(sys.getWindPhase()).toBe(after); // unchanged by cosmeticUpdate
  });

  it('updates excitement on 30Hz instances during cosmeticUpdate', () => {
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 90, y: 580, width: 28, height: 40 })],
    });
    const sys = new ReactiveDecorationSystem(state, makeArena(), () => {});
    const i = inst({ kind: 'test.bg', proximity: { radius: 60, mode: 'excite', magnitude: 1 } });
    sys.setInstances([i]);
    for (let n = 0; n < 10; n++) sys.cosmeticUpdate(1 / 30);
    expect(i.excitement).toBeGreaterThan(0.5);
  });

  it('updates excitement on 60Hz instances during fixedUpdate, not cosmeticUpdate', () => {
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 90, y: 580, width: 28, height: 40 })],
    });
    const sys = new ReactiveDecorationSystem(state, makeArena(), () => {});
    const i = inst({ kind: 'test.fast', proximity: { radius: 60, mode: 'excite', magnitude: 1 } });
    sys.setInstances([i]);
    for (let n = 0; n < 20; n++) sys.cosmeticUpdate(1 / 30);
    expect(i.excitement).toBe(0); // cosmeticUpdate skipped 60Hz instance
    for (let n = 0; n < 20; n++) sys.fixedUpdate(1 / 60);
    expect(i.excitement).toBeGreaterThan(0.5);
  });

  it('applyStompImpulse sets shakeDecay only on instances inside shakeRadius', () => {
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    const near = inst({ kind: 'test.bg', pos: { x: 100, y: 600 }, shakeRadius: 80 });
    const far = inst({ kind: 'test.bg', pos: { x: 500, y: 600 }, shakeRadius: 80 });
    sys.setInstances([near, far]);
    sys.applyStompImpulse(120, 600);
    expect(near.shakeDecay).toBe(1);
    expect(far.shakeDecay).toBe(0);
  });

  it('fires burst exactly once per stomp', () => {
    const emit = vi.fn();
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), emit);
    const i = inst({
      kind: 'test.bg', pos: { x: 100, y: 600 }, shakeRadius: 80,
      burst: { threshold: 0.95, particleKind: 'leaf', count: 5 },
    });
    sys.setInstances([i]);
    sys.applyStompImpulse(100, 600); // shakeDecay = 1
    sys.cosmeticUpdate(1 / 30); // crosses 0.95 threshold once
    expect(emit).toHaveBeenCalledTimes(1);
    sys.cosmeticUpdate(1 / 30); // already above threshold + decaying — no second fire
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('cleanup clears instances and windPhase', () => {
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    sys.setInstances([inst()]);
    sys.fixedUpdate(1 / 60);
    sys.cleanup();
    expect(sys.getInstances30Hz()).toHaveLength(0);
    expect(sys.getInstances60Hz()).toHaveLength(0);
    expect(sys.getWindPhase()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/engine/gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts
```
Expected: FAIL — `ReactiveDecorationSystem` not defined.

- [ ] **Step 3: Create `ReactiveDecorationSystem.ts`**

```typescript
// src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts
import type { Arena, MatchState } from '../../types';
import type { CosmeticSystem } from '../types';
import { getSlowDevice } from '../../perfFlags';
import {
  applyShakeImpulse, decayShake, getReactiveKind, shouldFireBurst, updateExcitement,
  type ReactiveInstance,
} from './reactiveDecorations';

/** Wind oscillator angular speed (rad/s). One cycle ≈ 10s. */
const WIND_SPEED = 0.6;

/** Burst emitter callback signature. The system calls this when a burst fires;
 *  GameLoop wires it to ParticleSystem.emitParticle (or a thin wrapper that
 *  spawns multiple particles with kind-specific styling). */
export type BurstEmitter = (
  instance: ReactiveInstance,
  arena: Arena,
) => void;

/**
 * Cosmetic system: arena-anchored decorations with wind sway, proximity
 * response, stomp shake, and burst triggers. Update split into 30Hz (default)
 * and 60Hz (per-kind opt-in) buckets so fast-moving creatures stay smooth.
 *
 * Renders in two slots — pre-player and post-player — to preserve the existing
 * z-ordering of butterflies/bees vs trees/dandelions.
 */
export class ReactiveDecorationSystem implements CosmeticSystem {
  private state: MatchState;
  private arena: Arena;
  private burstEmit: BurstEmitter;

  private _instances30: ReactiveInstance[] = [];
  private _instances60: ReactiveInstance[] = [];
  private _windPhase = 0;

  constructor(state: MatchState, arena: Arena, burstEmit: BurstEmitter) {
    this.state = state;
    this.arena = arena;
    this.burstEmit = burstEmit;
  }

  init(): void {
    // No-op: instances are populated via setInstances() at arena-load time.
  }

  /** Replace the instance list. Buckets by registered kind frequency.
   *  Unknown kinds (no registration) are dropped with a warning. */
  setInstances(instances: ReactiveInstance[]): void {
    this._instances30.length = 0;
    this._instances60.length = 0;
    for (const inst of instances) {
      const cfg = getReactiveKind(inst.kind);
      if (!cfg) {
        // Dev-time visibility — should not happen in production builds.
        console.warn(`[ReactiveDecorationSystem] unknown kind '${inst.kind}'`);
        continue;
      }
      if (cfg.highFrequency) this._instances60.push(inst);
      else this._instances30.push(inst);
    }
  }

  /** All 30Hz-bucketed instances. For Renderer use. */
  getInstances30Hz(): ReadonlyArray<ReactiveInstance> { return this._instances30; }
  /** All 60Hz-bucketed instances. For Renderer use. */
  getInstances60Hz(): ReadonlyArray<ReactiveInstance> { return this._instances60; }
  /** Current wind oscillator phase. For Renderer (passed to draw fns). */
  getWindPhase(): number { return this._windPhase; }

  /** 60Hz tick. Called from GameLoop.fixedUpdate. Advances windPhase, runs the
   *  60Hz instance bucket. */
  fixedUpdate(dt: number): void {
    this._windPhase += WIND_SPEED * dt;
    if (this._instances60.length > 0) this._tickBucket(this._instances60, dt);
  }

  /** 30Hz tick. Called from GameLoop.cosmeticStep. Runs the 30Hz instance bucket. */
  cosmeticUpdate(dt: number): void {
    if (this._instances30.length > 0) this._tickBucket(this._instances30, dt);
  }

  /** Apply a stomp impulse to all instances within their shakeRadius. */
  applyStompImpulse(stompX: number, stompY: number): void {
    for (const i of this._instances30) applyShakeImpulse(i, stompX, stompY);
    for (const i of this._instances60) applyShakeImpulse(i, stompX, stompY);
  }

  /** Re-prime per-instance state (zeros excitement / shakeDecay). Used on
   *  guest reconnect or loading→playing edge to avoid stale carryover. */
  resetBaseline(): void {
    for (const i of this._instances30) { i.excitement = 0; i.shakeDecay = 0; }
    for (const i of this._instances60) { i.excitement = 0; i.shakeDecay = 0; }
  }

  cleanup(): void {
    this._instances30.length = 0;
    this._instances60.length = 0;
    this._windPhase = 0;
  }

  // ---- internals ----

  private _tickBucket(bucket: ReactiveInstance[], dt: number): void {
    const slow = getSlowDevice();
    const players = this.state.players;
    for (let i = 0; i < bucket.length; i++) {
      const inst = bucket[i];

      // Proximity / excitement.
      if (inst.proximity && !slow) {
        let nearestSq = Infinity;
        for (let pi = 0; pi < players.length; pi++) {
          const p = players[pi];
          if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
          const dx = (p.x + p.width * 0.5) - inst.pos.x;
          const dy = (p.y + p.height * 0.5) - inst.pos.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < nearestSq) nearestSq = d2;
        }
        const dist = Math.sqrt(nearestSq);
        updateExcitement(inst, dist, dt);
      }

      // Shake decay + burst edge.
      if (inst.shakeDecay > 0 || (inst.burst !== undefined)) {
        const prevShake = inst.shakeDecay;
        decayShake(inst, dt);
        // Burst triggers on rising edge — handle in applyStompImpulse path
        // (shake just set to 1) by checking before-and-after here. The
        // pre-decay value was 1.0 if the impulse just landed, so we test the
        // "did we just become >= threshold this tick" predicate.
        if (shouldFireBurst(inst, prevShake < inst.shakeDecay ? prevShake : 0)) {
          this.burstEmit(inst, this.arena);
        }
      }
    }
  }
}
```

Wait — burst edge detection nuance: `applyShakeImpulse` sets `shakeDecay = 1` BEFORE `_tickBucket` runs (it's called from a separate stomp-callback path). The next tick's `_tickBucket` sees `prevShake = 1`, decays, and checks if `prevShake < threshold && shakeDecay >= threshold` — but `prevShake = 1 ≥ threshold`, so `shouldFireBurst` returns false. We need to capture the rising edge from BEFORE the impulse, not within the tick.

Use a per-instance `_prevShakeForBurst` state field, updated at end of tick. On `applyShakeImpulse`, capture the pre-impulse shake into a transient field that the next `_tickBucket` reads.

Simpler fix: fire the burst immediately inside `applyShakeImpulse`, since that's the rising-edge moment. Refactor:

Replace the `// Shake decay + burst edge.` block in `_tickBucket` with just:
```typescript
      // Shake decay (burst is fired in applyStompImpulse on rising edge).
      decayShake(inst, dt);
```

And update `applyStompImpulse`:

```typescript
  applyStompImpulse(stompX: number, stompY: number): void {
    for (const arr of [this._instances30, this._instances60]) {
      for (let i = 0; i < arr.length; i++) {
        const inst = arr[i];
        const prev = inst.shakeDecay;
        applyShakeImpulse(inst, stompX, stompY);
        if (inst.shakeDecay > prev && inst.burst && prev < inst.burst.threshold && inst.shakeDecay >= inst.burst.threshold) {
          this.burstEmit(inst, this.arena);
        }
      }
    }
  }
```

This makes the burst fire exactly once per stomp impulse (when `shakeDecay` snaps to 1 from below threshold). Update the test to expect this behavior — it already does (`sys.applyStompImpulse(...)` followed by `sys.cosmeticUpdate(...)` checks burst was called once during the impulse).

The test `fires burst exactly once per stomp` calls `applyStompImpulse(100, 600)` → fires burst — then `cosmeticUpdate` → no second fire. After fix, the first call fires inside `applyStompImpulse`, the second `cosmeticUpdate` finds shakeDecay decaying but no rising edge — passes.

Apply the corrected code:

```typescript
// (inside the class — replace _tickBucket's shake block)
      decayShake(inst, dt);
```

```typescript
// (inside the class — replace applyStompImpulse)
  applyStompImpulse(stompX: number, stompY: number): void {
    this._applyImpulseToBucket(this._instances30, stompX, stompY);
    this._applyImpulseToBucket(this._instances60, stompX, stompY);
  }

  private _applyImpulseToBucket(bucket: ReactiveInstance[], x: number, y: number): void {
    for (let i = 0; i < bucket.length; i++) {
      const inst = bucket[i];
      const prev = inst.shakeDecay;
      applyShakeImpulse(inst, x, y);
      if (inst.shakeDecay > prev && inst.burst
        && prev < inst.burst.threshold && inst.shakeDecay >= inst.burst.threshold) {
        this.burstEmit(inst, this.arena);
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/engine/gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts
```
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Run the full cosmetics test suite to confirm no regressions**

```bash
npx vitest run src/engine/gameLoop/cosmetics/
```
Expected: all green. The new system is isolated; nothing should break.

- [ ] **Step 6: Commit**

```bash
git add src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts src/engine/gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts
git commit -m "$(cat <<'EOF'
reactive: ReactiveDecorationSystem class — bucketing + primitives wiring

CosmeticSystem implementation. Owns instance buckets keyed by registered
30/60Hz frequency. fixedUpdate (60Hz path + windPhase) called by GameLoop.
cosmeticUpdate (30Hz path) implements CosmeticSystem. applyStompImpulse
fires bursts on rising-edge crossing of shakeDecay threshold.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `buildReactiveDecorations` and `cosmeticTick` to `ArenaPack`, `ThemeConfig`, and registry forwarding

**Files:**
- Modify: `src/engine/arenas/types.ts`
- Modify: `src/engine/themes/types.ts`
- Modify: `src/engine/arenas/registry.ts`

These are interface additions only — no behavior change yet. Existing packs keep working (fields are optional).

- [ ] **Step 1: Add fields to `ArenaPack`**

In `src/engine/arenas/types.ts`, add these imports near the top (after the existing themes/types import block):

```typescript
import type { ReactiveInstance } from '../gameLoop/cosmetics/reactiveDecorations';
```

Add a new exported type:

```typescript
/** Per-arena cosmetic services passed to `cosmeticTick`. */
export interface ArenaCosmeticServices {
  emitParticle: (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) => void;
}
```

Then add the two new fields inside the `ArenaPack` interface, right after `drawAnimatedForeground` (line ~119):

```typescript
  /** Build the arena's reactive decoration instance list. Called once per
   *  arena load. Positions can depend on platform layout (use `arena.platforms`).
   *  All `kind` values must be pre-registered via `registerReactiveKind` (the
   *  arena pack typically does that at module load time). */
  buildReactiveDecorations?: (arena: Arena) => ReactiveInstance[];

  /** Per-tick cosmetic logic specific to this arena. Runs in cosmeticStep at
   *  ~30Hz. Use for arena-specific particle emitters or bespoke effects that
   *  don't fit the reactive-decoration model (player-emitted trails,
   *  environmental triggers, etc.). The pack owns any state it needs as
   *  module-local closures. */
  cosmeticTick?: (
    state: import('../types').MatchState,
    dt: number,
    services: ArenaCosmeticServices,
  ) => void;
```

- [ ] **Step 2: Add the same fields to `ThemeConfig`**

The Renderer reads `theme.buildReactiveDecorations` (Task 7), and GameLoop reads `theme.cosmeticTick` (Task 6). Both go through `ThemeConfig`.

In `src/engine/themes/types.ts`, find the existing `drawAnimatedForeground?:` line and add right after it (and import `ArenaCosmeticServices` + `ReactiveInstance` at the top of the file alongside any existing arena-types imports):

```typescript
// At top of file, alongside existing imports:
import type { ReactiveInstance } from '../gameLoop/cosmetics/reactiveDecorations';
import type { ArenaCosmeticServices } from '../arenas/types';
```

Add to `ThemeConfig`:

```typescript
  buildReactiveDecorations?: (arena: import('../types').Arena) => ReactiveInstance[];
  cosmeticTick?: (
    state: import('../types').MatchState,
    dt: number,
    services: ArenaCosmeticServices,
  ) => void;
```

If a circular import warning appears (themes/types ↔ arenas/types), inline the `ArenaCosmeticServices` definition directly in `themes/types.ts` instead of importing it. They're trivial enough to duplicate cleanly; the canonical home stays in `arenas/types.ts`.

- [ ] **Step 3: Forward in `arenas/registry.ts:toThemeConfig`**

Find the existing `toThemeConfig` function and add the two fields to the returned object alongside `drawAnimatedForeground`:

```typescript
    drawAnimatedForeground: pack.drawAnimatedForeground,
    buildReactiveDecorations: pack.buildReactiveDecorations,
    cosmeticTick: pack.cosmeticTick,
```

(The exact location: search for `drawAnimatedForeground: pack.drawAnimatedForeground` — there should be one line, add the two new lines below it.)

- [ ] **Step 4: Run typecheck to verify nothing else breaks**

```bash
npx tsc -b 2>&1 | tail -10
```
Expected: no errors. Existing packs (no `buildReactiveDecorations` / `cosmeticTick`) compile because the fields are optional.

- [ ] **Step 5: Run the existing test suite to confirm no behavioral regressions**

```bash
npm test 2>&1 | tail -10
```
Expected: ~2000 tests pass; pre-existing flakes unchanged. No new failures.

- [ ] **Step 6: Commit**

```bash
git add src/engine/arenas/types.ts src/engine/themes/types.ts src/engine/arenas/registry.ts
git commit -m "$(cat <<'EOF'
reactive: ArenaPack.buildReactiveDecorations + cosmeticTick fields

Optional interface additions. Both fields forwarded through toThemeConfig
so the Renderer + GameLoop can read them via theme. ThemeConfig mirrors
the same shape. No behavior change yet — existing packs unaffected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire stomp transitions into the system via `TransitionCallbacks.onStomp`

**Files:**
- Modify: `src/engine/gameLoop/cosmetics/playerTransitions.ts`
- Modify: `src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts`

The system needs to learn about stomp events. Add a new optional callback to `TransitionCallbacks`. Existing systems wire it to `ReactiveDecorationSystem.applyStompImpulse`.

- [ ] **Step 1: Write the failing test**

Add a test to `src/engine/gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts` (open and append to the existing `describe`):

```typescript
  it('exposes a stomp-event callback that GameLoop can wire to TransitionCallbacks', () => {
    // Smoke test: applyStompImpulse can be passed by reference as a callback
    // (matches the signature TransitionCallbacks.onStomp expects).
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    const cb: (x: number, y: number) => void = sys.applyStompImpulse.bind(sys);
    expect(typeof cb).toBe('function');
    cb(100, 600); // shouldn't throw
  });
```

Run: `npx vitest run src/engine/gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts -t "stomp-event callback"`
Expected: PASS (the binding exists already).

- [ ] **Step 2: Add `onStomp` to `TransitionCallbacks`**

In `src/engine/gameLoop/cosmetics/playerTransitions.ts`, modify the `TransitionCallbacks` interface (lines ~33-42):

```typescript
export interface TransitionCallbacks {
  playSound: (name: string) => void;
  playAnimal: (characterName: string) => void;
  spawnDustParticles: (player: Player, landVy: number) => void;
  spawnJumpDustParticles: (player: Player) => void;
  spawnKillSplatter: (victim: Player) => void;
  pickupCarrotVFX: (x: number, y: number) => void;
  spawnPlayerSpawnVFX: (x: number, y: number) => void;
  /** Optional: fired when a player transitions to 'splat' (stomp landing).
   *  Receives the stomp position (victim's center). Used by
   *  ReactiveDecorationSystem to shake nearby trees / saplings. */
  onStomp?: (x: number, y: number) => void;
}
```

- [ ] **Step 3: Fire `onStomp` in the existing stomp branch**

In the same file, find the stomp branch (lines ~91-100):

```typescript
  if (prev.state !== 'splat' && prev.state !== 'respawning' && player.state === 'splat' && !player.disconnected) {
    cb.playSound('stomp');
    cb.playAnimal(player.character.name);
    cb.spawnKillSplatter(player);
    state.shockwaves.push({
      x: player.x + player.width / 2, y: player.y + player.height / 2,
      radius: 0, maxRadius: SHOCKWAVE_MAX_RADIUS, life: SHOCKWAVE_DURATION,
    });
  }
```

Add the onStomp call at the end of the same block (before the closing brace):

```typescript
    if (cb.onStomp) cb.onStomp(player.x + player.width / 2, player.y + player.height / 2);
```

- [ ] **Step 4: PlayerTransitionSystem accepts an onStomp via constructor and forwards it**

In `src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts`, modify the constructor signature and the `this.callbacks` block:

```typescript
  constructor(
    state: MatchState,
    settings: MatchSettings,
    playSound: (name: string) => void,
    playAnimal: (name: string) => void,
    particleSystem: ParticleSystem,
    onStomp?: (x: number, y: number) => void,
  ) {
    this.state = state;
    this.settings = settings;
    this.playSound = playSound;
    this.playAnimal = playAnimal;
    this.particleSystem = particleSystem;

    this.callbacks = {
      playSound: this.playSound,
      playAnimal: this.playAnimal,
      spawnDustParticles: (p, vy) => this.particleSystem.spawnDustParticles(p, vy),
      spawnJumpDustParticles: (p) => { if (!getSlowDevice()) this.particleSystem.spawnJumpDustParticles(p); },
      spawnKillSplatter: (v) => this.particleSystem.spawnKillSplatter(v, this.settings),
      pickupCarrotVFX: (x, y) => this.particleSystem.pickupCarrotVFX(x, y),
      spawnPlayerSpawnVFX: (x, y) => this.particleSystem.spawnRingVFX(x, y),
      onStomp,
    };
  }
```

- [ ] **Step 5: Typecheck and run cosmetics tests**

```bash
npx tsc -b 2>&1 | tail -5
npx vitest run src/engine/gameLoop/cosmetics/
```
Expected: clean typecheck; all cosmetics tests green. Existing PlayerTransitionSystem callers in `GameLoop.ts` will call the constructor without the new arg — that's fine, `onStomp` is optional.

- [ ] **Step 6: Commit**

```bash
git add src/engine/gameLoop/cosmetics/playerTransitions.ts src/engine/gameLoop/cosmetics/PlayerTransitionSystem.ts src/engine/gameLoop/cosmetics/__tests__/ReactiveDecorationSystem.test.ts
git commit -m "$(cat <<'EOF'
reactive: TransitionCallbacks.onStomp — optional stomp event hook

Wired through PlayerTransitionSystem constructor. Used in next task by
GameLoop to forward stomp positions to ReactiveDecorationSystem so trees
shake and bursts fire. Existing PlayerTransitionSystem callers unaffected
(onStomp is optional).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: GameLoop wiring — construct system, call from fixedUpdate + cosmeticStep, wire stomp + bursts + cosmeticTick

**Files:**
- Modify: `src/engine/gameLoop/GameLoop.ts`
- Modify: `src/engine/gameLoop/cosmetics/index.ts`

This stitches the system into the cosmetic pipeline. After this task, the system runs but has no instances yet (meadow's `buildReactiveDecorations` is added in Task 8).

- [ ] **Step 1: Export the system from cosmetics barrel**

In `src/engine/gameLoop/cosmetics/index.ts`, add:

```typescript
export { ReactiveDecorationSystem } from './ReactiveDecorationSystem';
export {
  registerReactiveKind, getReactiveKind, hasReactiveKind,
  type ReactiveInstance, type ReactiveLayer, type ReactiveDraw, type ReactiveKindConfig,
  type ProximityMode,
} from './reactiveDecorations';
```

- [ ] **Step 2: Construct the system in GameLoop**

In `src/engine/gameLoop/GameLoop.ts`:

Add to imports near the top (alongside other cosmetic system imports around line 34-40):

```typescript
import { ReactiveDecorationSystem } from './cosmetics/ReactiveDecorationSystem';
import type { ReactiveInstance } from './cosmetics/reactiveDecorations';
```

Add a private field declaration alongside the other system fields (line ~64-70):

```typescript
  private reactiveDecorationSystem!: ReactiveDecorationSystem;
```

In the constructor, after `this.particleSystem = ...` and after the existing cosmetic systems (around line 145-146), add the reactive system construction block:

```typescript
    // ReactiveDecorationSystem must be constructed before PlayerTransitionSystem
    // so we can pass its applyStompImpulse as the onStomp callback.
    this.reactiveDecorationSystem = new ReactiveDecorationSystem(
      sState, sArena,
      (instance, _arena) => this._emitReactiveBurst(instance),
    );
    if (sTheme.buildReactiveDecorations) {
      this.reactiveDecorationSystem.setInstances(sTheme.buildReactiveDecorations(sArena));
    }
```

Then update the existing `playerTransitionSystem` construction (around line 133) to pass the onStomp callback:

```typescript
    this.playerTransitionSystem = new PlayerTransitionSystem(
      sState, settings, (name) => this.playSound(name),
      (name) => { if (this._audioEnabled) audio.playAnimal(name); },
      this.particleSystem,
      (x, y) => this.reactiveDecorationSystem.applyStompImpulse(x, y),
    );
```

(Note: the reactive system is constructed BEFORE the player transition system in the modified order.)

Add the burst emitter helper method (private), placed below `private playSound(name: string)` around line 240:

```typescript
  private _emitReactiveBurst(instance: ReactiveInstance): void {
    if (!instance.burst) return;
    // Spawn `count` particles using the kind's burst color/style. For PR 1
    // we keep this minimal: small petal-shaped fragments above the instance.
    // Future tasks can extend per-particleKind styling.
    const { count, particleKind } = instance.burst;
    const cx = instance.pos.x;
    const cy = instance.pos.y - 8;
    const color = particleKind === 'leaf' ? '#5a8f3a'
                : particleKind === 'petal' ? '#ffb3d9'
                : '#cccccc';
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      const speed = 50 + Math.random() * 80;
      const life = 0.6 + Math.random() * 0.5;
      this.particleSystem.emitParticle(
        cx, cy,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        life, 1.5 + Math.random() * 1.5, color,
      );
    }
  }
```

- [ ] **Step 3: Call the system from `cosmeticStep` and `fixedUpdate`**

In `cosmeticStep` (around line 482-514), add the reactive system call alongside the others. Place it right before the `hudFeedbackSystem` call:

```typescript
      const reactiveStart = perfTrace.begin('cosmetic.reactive');
      this.reactiveDecorationSystem.cosmeticUpdate(dt);
      perfTrace.end('cosmetic.reactive', reactiveStart);
```

Find `fixedUpdate` (search for `fixedUpdate(dt: number)`) and at its top, after the early-return guard but before delegating to `simulator.fixedUpdate(dt)`, add:

```typescript
      // 60Hz path: advance windPhase + run high-frequency reactive instances.
      this.reactiveDecorationSystem.fixedUpdate(dt);
```

If `fixedUpdate` is structured such that the reactive call needs to be after `simulator.fixedUpdate(dt)`, place it there instead — the order doesn't affect correctness because the system reads `state.players` (positions) which are valid before AND after simulator.fixedUpdate. Place wherever the existing cosmetic-system tick conventions land.

- [ ] **Step 4: Wire `arena.cosmeticTick` (for underwater bubble trails — Task 9 will provide the underwater hook)**

Inside `cosmeticStep`, after the reactive system call, add:

```typescript
      // Per-arena bespoke cosmetic logic (e.g. underwater bubble trails).
      const tick = this.simulator.getTheme().cosmeticTick;
      if (tick) {
        const arenaCosmeticStart = perfTrace.begin('cosmetic.arena');
        tick(this.simulator.getState(), dt, {
          emitParticle: (x, y, vx, vy, life, size, color) =>
            this.particleSystem.emitParticle(x, y, vx, vy, life, size, color),
        });
        perfTrace.end('cosmetic.arena', arenaCosmeticStart);
      }
```

- [ ] **Step 5: Update `switchArena` to rebuild the reactive system**

Find the `switchArena` method (around line 320-370). After the line that constructs the new EnvironmentSystem (around 356), add:

```typescript
    this.reactiveDecorationSystem = new ReactiveDecorationSystem(
      sState, sArena,
      (instance, _arena) => this._emitReactiveBurst(instance),
    );
    if (newTheme.buildReactiveDecorations) {
      this.reactiveDecorationSystem.setInstances(newTheme.buildReactiveDecorations(sArena));
    }
```

(Replace `sArena` with whatever the local-scoped arena variable is named in `switchArena` — it's typically `this.simulator.getArena()` returned via `sArena` after the simulator-side switch. Look at how the surrounding `EnvironmentSystem` uses the post-switch arena.)

Also re-wire the playerTransitionSystem onStomp:

```typescript
    this.playerTransitionSystem = new PlayerTransitionSystem(
      sState, settings, (name) => this.playSound(name),
      (name) => { if (this._audioEnabled) audio.playAnimal(name); },
      this.particleSystem,
      (x, y) => this.reactiveDecorationSystem.applyStompImpulse(x, y),
    );
```

- [ ] **Step 6: Update `warmupCosmeticDuringLoading` and `resetCosmeticBaselines`**

Find `warmupCosmeticDuringLoading` (around line 470-479). Add the reactive system to the warmup loop:

```typescript
    this.reactiveDecorationSystem.cosmeticUpdate(dt);
```

(Place alongside the other system calls in that method.)

Find `resetCosmeticBaselines` (around line 444-449). Add:

```typescript
    this.reactiveDecorationSystem.resetBaseline();
```

- [ ] **Step 7: Typecheck**

```bash
npx tsc -b 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 8: Run the gameLoop test suite**

```bash
npx vitest run src/engine/gameLoop/
```
Expected: all green. Tests construct GameLoop with full mocking; the new system has no instances (no pack provides `buildReactiveDecorations` yet), so it's effectively a no-op in tests.

- [ ] **Step 9: Run the full simulator + integration suites**

```bash
npx vitest run src/engine/simulator/
npx vitest run src/engine/__tests__/regression-determinism.test.ts
```
Expected: all green. The reactive system runs in cosmeticStep, doesn't touch determinism.

- [ ] **Step 10: Commit**

```bash
git add src/engine/gameLoop/GameLoop.ts src/engine/gameLoop/cosmetics/index.ts
git commit -m "$(cat <<'EOF'
reactive: GameLoop wiring — construct, tick, stomp + cosmeticTick

ReactiveDecorationSystem instantiated alongside other cosmetic systems
in the GameLoop constructor and switchArena. Calls fixedUpdate (60Hz +
windPhase) and cosmeticUpdate (30Hz). Stomp transitions piped through
PlayerTransitionSystem.onStomp into applyStompImpulse so trees shake
and bursts fire. Per-arena cosmeticTick hook called once per cosmeticStep
with an emitParticle service. No behavior change yet — meadow's
buildReactiveDecorations + underwater's cosmeticTick land next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Renderer integration — render reactive decorations in two slots

**Files:**
- Modify: `src/engine/renderer.ts`

The renderer needs a way to call into the system. The cleanest hand-off: GameLoop exposes the system's instance arrays + windPhase to the renderer via a small helper method, and the renderer iterates them in two slots.

- [ ] **Step 1: Expose reactive state from GameLoop**

In `src/engine/gameLoop/GameLoop.ts`, add a public accessor near other getters (around line 270):

```typescript
  /** Reactive decoration system accessor (used by Renderer to draw instances). */
  getReactiveDecorationSystem(): ReactiveDecorationSystem {
    return this.reactiveDecorationSystem;
  }
```

- [ ] **Step 2: Modify Renderer to accept a "reactive draw context"**

In `src/engine/renderer.ts`, find `renderFrame` and the existing call sites for `drawAnimatedBackground` (line ~661) and `drawAnimatedForeground` (line ~1000).

Add a new optional parameter to `renderFrame` to receive reactive state. Search the current `renderFrame` signature:

```typescript
  renderFrame(matchState: MatchState, arena: Arena, particles: Particle[], cosmeticLead: number = 0): void {
```

Add a 5th param:

```typescript
  renderFrame(
    matchState: MatchState,
    arena: Arena,
    particles: Particle[],
    cosmeticLead: number = 0,
    reactive?: {
      instances: ReadonlyArray<import('./gameLoop/cosmetics/reactiveDecorations').ReactiveInstance>;
      windPhase: number;
    },
  ): void {
```

Add a helper method on the Renderer class (place near `_drawForegroundNatureDirect` around line 493):

```typescript
  private _drawReactiveLayer(
    ctx: CanvasRenderingContext2D,
    instances: ReadonlyArray<import('./gameLoop/cosmetics/reactiveDecorations').ReactiveInstance>,
    windPhase: number,
    layer: 'background' | 'foreground',
    matchState: MatchState,
  ): void {
    if (!instances || instances.length === 0) return;
    const slow = getSlowDevice();
    const time = matchState.timeElapsed;
    const dayPhase = matchState.dayPhase ?? 0;
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const cfg = getReactiveKind(inst.kind);
      if (!cfg || cfg.layer !== layer) continue;
      const swayPhase = slow || !inst.windAmp
        ? 0
        : Math.sin(windPhase + inst.seed * 0.7) * inst.windAmp;
      cfg.draw(ctx, inst, swayPhase, time, dayPhase);
    }
  }
```

Add the import at the top of `renderer.ts`:

```typescript
import { getReactiveKind } from './gameLoop/cosmetics/reactiveDecorations';
```

Insert a call site for the **background** layer right before the player layer. Find line ~949-953 (the fg-nature blit), and right after the blit but before the ghosts loop (line ~955), add:

```typescript
      // Reactive decorations — background (pre-player) layer.
      if (reactive) {
        const thA = this.originalArena ?? arena;
        this.withMirror(ctx, () => this._drawReactiveLayer(ctx, reactive.instances, reactive.windPhase, 'background', matchState));
        // thA only used when withMirror needs an arena ref; OK to ignore here
        // since instances are pre-positioned. (Mirror handled by withMirror.)
      }
```

Insert a call site for the **foreground** layer right where `drawAnimatedForeground` is called (line ~1000-1003). Add immediately AFTER that call:

```typescript
      if (reactive) {
        this.withMirror(ctx, () => this._drawReactiveLayer(ctx, reactive.instances, reactive.windPhase, 'foreground', matchState));
      }
```

- [ ] **Step 3: Update GameLoop's render call sites to pass the reactive context**

In `src/engine/gameLoop/GameLoop.ts`, find the `renderFrame` method (around line 517-530). Update the renderer call:

```typescript
  renderFrame(frameDt?: number): void {
    const state = this.simulator.getState();
    const arena = this.simulator.getArena();
    // ... existing decay logic ...
    const reactive = {
      instances: [
        ...this.reactiveDecorationSystem.getInstances30Hz(),
        ...this.reactiveDecorationSystem.getInstances60Hz(),
      ],
      windPhase: this.reactiveDecorationSystem.getWindPhase(),
    };
    this.renderer.renderFrame(state, arena, this.particleSystem.getParticles(), this._cosmeticLead, reactive);
  }
```

(Adjust to match the existing structure; the key change is adding the `reactive` arg.)

**Allocation note**: `[...a, ...b]` allocates a new array every frame. For PR 1 this is acceptable (one small array per frame). If perf shows up in profiling later, hoist a private `_reactiveBuf: ReactiveInstance[]` field and rebuild in-place; not necessary now.

- [ ] **Step 4: Run renderer tests**

```bash
npx vitest run src/engine/renderer.test.ts
```
Expected: all green. Existing tests don't pass `reactive`; the optional param defaults to undefined and the new branch is skipped.

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -10
```
Expected: ~2000 tests pass, no new failures.

- [ ] **Step 6: Manual visual check (no instances yet — should look unchanged)**

```bash
npm run dev
```
Open `http://localhost:5173/bunnybrawl/?arena=meadow&bots=2&killLimit=4`. Match should run normally, look identical to current main. Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add src/engine/renderer.ts src/engine/gameLoop/GameLoop.ts
git commit -m "$(cat <<'EOF'
reactive: Renderer integration — pre-player + post-player draw slots

Renderer iterates ReactiveInstance arrays via the kind registry's draw
fns. Two slots: 'background' (after fg-nature cache blit, before player
layer) and 'foreground' (after drawAnimatedForeground, post-player) so
butterflies/bees keep their in-front-of-player layering. Sway phase
precomputed per-instance via Math.sin(windPhase + seed*0.7) * windAmp,
zeroed on slow-device.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Migrate meadow — define + register all kinds, build instance list, strip inline draw calls

**Files:**
- Modify: `src/engine/arenas/packs/meadow.ts`
- Create: `src/engine/arenas/packs/__tests__/meadow-decorations.test.ts`

This is the biggest task. I'll break it into sub-steps by archetype group. Each sub-step adds a kind family + migrates the relevant draw calls + commits, so the work is reviewable in chunks.

### Background

Meadow currently has:
- **drawBackgroundNature** (lines 429-471): trees (3), bushes (5+ground+platforms), flowers (10+platforms), mushrooms (2), grass tufts (per-platform).
- **drawForegroundNature** (lines 473-515): fg bushes (4+platforms), tall grass (4 clusters), ferns (3), hanging vines (per-platform), fg leaf clusters (per-platform), fg wildflowers (4).
- **drawAnimatedBackground** (lines 622-706): dandelions (9 instances) with reactive seed burst.
- **drawAnimatedForeground** (lines 713-720): butterflies (8) + bees (2 clusters of 6).
- **drawGroundCritters** (lines 708-711): snails (2). Stays where it is — out of scope for PR 1 (it's a different abstraction; bundle in a future PR).

After migration:
- `drawBackgroundNature` becomes near-empty (or fully empty).
- `drawForegroundNature` becomes near-empty.
- `drawAnimatedBackground` has the dandelion logic removed; might still hold non-decoration logic (verify nothing else lives there).
- `drawAnimatedForeground` has butterfly+bee logic removed; might still hold non-decoration logic (verify).
- `buildReactiveDecorations` is the new source of truth for all of the above.

### Sub-task 8.1: Static ground decorations — tree, bush, flower, mushroom, grassTuft

- [ ] **Step 1: Add factories + draw fns + registrations to `meadow.ts`**

At the top of `meadow.ts`, after the existing helper data block but before the pack object literal, add a new section for reactive decoration factories. Place it just before the `import { drawTree, ... } from '../../themes/drawPrimitives'` block (so the imports are colocated):

```typescript
// ============================================================================
// Reactive decoration factories + draw fns
// ============================================================================

import {
  registerReactiveKind,
  type ReactiveInstance,
} from '../../gameLoop/cosmetics';

// ---- meadow.tree ----
function meadowTree(x: number, y: number, size: number): ReactiveInstance {
  return {
    pos: { x, y },
    kind: 'meadow.tree',
    seed: Math.floor((x * 73 + y * 31) % 997),
    windAmp: 5,
    shakeRadius: 80,
    burst: { threshold: 0.95, particleKind: 'leaf', count: 12 },
    excitement: 0,
    shakeDecay: 0,
    // Per-instance custom data: store size in a side-channel via prototype-free
    // closure — for tree, we use the seed encoding. Simpler: use a small
    // per-pack extension Map.
  };
}
const _treeSize = new Map<ReactiveInstance, number>();
function meadowTreeWithSize(x: number, y: number, size: number): ReactiveInstance {
  const inst = meadowTree(x, y, size);
  _treeSize.set(inst, size);
  return inst;
}
registerReactiveKind('meadow.tree', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    const size = _treeSize.get(inst) ?? 50;
    // Tree leans with swayPhase + shakeDecay shudder.
    const lean = swayPhase + (inst.shakeDecay > 0 ? Math.sin(inst.shakeDecay * 40) * inst.shakeDecay * 4 : 0);
    ctx.save();
    ctx.translate(inst.pos.x, inst.pos.y);
    // Defer to existing drawTree primitive after rotating around base.
    // drawTree expects (ctx, x, y, size) where (x,y) is base.
    // To apply lean as a rotation around the base, we rotate the canvas.
    ctx.rotate(lean * 0.01); // 5px sway → ~3° tilt
    drawTree(ctx, 0, 0, size);
    ctx.restore();
  },
});

// ---- meadow.bush ----
function meadowBush(x: number, y: number, size: number): ReactiveInstance {
  const inst: ReactiveInstance = {
    pos: { x, y },
    kind: 'meadow.bush',
    seed: Math.floor((x * 53 + y * 19) % 997),
    windAmp: 2,
    excitement: 0,
    shakeDecay: 0,
  };
  _bushSize.set(inst, size);
  return inst;
}
const _bushSize = new Map<ReactiveInstance, number>();
registerReactiveKind('meadow.bush', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    const size = _bushSize.get(inst) ?? 25;
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase * 0.5, inst.pos.y);
    drawBush(ctx, 0, 0, size);
    ctx.restore();
  },
});

// ---- meadow.flower ----
function meadowFlower(x: number, y: number, color: string): ReactiveInstance {
  const inst: ReactiveInstance = {
    pos: { x, y },
    kind: 'meadow.flower',
    seed: Math.floor((x * 41 + y * 7) % 997),
    windAmp: 1.5,
    excitement: 0,
    shakeDecay: 0,
  };
  _flowerColor.set(inst, color);
  return inst;
}
const _flowerColor = new Map<ReactiveInstance, string>();
registerReactiveKind('meadow.flower', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    const color = _flowerColor.get(inst) ?? '#FFD700';
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase, inst.pos.y);
    drawFlower(ctx, 0, 0, color);
    ctx.restore();
  },
});

// ---- meadow.mushroom ----
function meadowMushroom(x: number, y: number): ReactiveInstance {
  return {
    pos: { x, y },
    kind: 'meadow.mushroom',
    seed: Math.floor((x * 29 + y * 11) % 997),
    windAmp: 1, // small wobble only
    excitement: 0,
    shakeDecay: 0,
  };
}
registerReactiveKind('meadow.mushroom', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase * 0.3, inst.pos.y);
    drawMushroom(ctx, 0, 0);
    ctx.restore();
  },
});

// ---- meadow.grassTuft ----
function meadowGrassTuft(x: number, y: number): ReactiveInstance {
  return {
    pos: { x, y },
    kind: 'meadow.grassTuft',
    seed: Math.floor((x * 17 + y * 13) % 997),
    windAmp: 2,
    excitement: 0,
    shakeDecay: 0,
  };
}
registerReactiveKind('meadow.grassTuft', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase, inst.pos.y);
    drawGrassTuft(ctx, 0, 0);
    ctx.restore();
  },
});
```

(The `Map<ReactiveInstance, T>` side-channels keep `ReactiveInstance` lean. They're cleaned implicitly when the system rebuilds the instance list on `switchArena`. If WeakMap turns out to be more idiomatic for this codebase, swap; both work.)

- [ ] **Step 2: Add `buildReactiveDecorations` to the pack**

In the same `meadowPack` object, add the field right after the `drawAnimatedForeground` (or wherever fits the field order in the existing object literal):

```typescript
  buildReactiveDecorations: (arena) => {
    const ground = arena.platforms[0];
    const y = ground.y;
    const out: ReactiveInstance[] = [];

    // Trees (was drawBackgroundNature lines 433-436)
    out.push(meadowTreeWithSize(60, y, 50));
    out.push(meadowTreeWithSize(620, y, 60));
    out.push(meadowTreeWithSize(1180, y, 45));

    // Bushes (was drawBackgroundNature lines 438-443)
    out.push(meadowBush(200, y, 30));
    out.push(meadowBush(450, y, 22));
    out.push(meadowBush(700, y, 28));
    out.push(meadowBush(950, y, 25));
    out.push(meadowBush(1100, y, 20));

    // Flowers (was drawBackgroundNature lines 446-450)
    const flowerPositions = [150, 280, 420, 500, 580, 750, 930, 980, 1050, 1200];
    for (const fx of flowerPositions) {
      const color = FLOWER_COLORS[Math.floor(fx * 0.01) % FLOWER_COLORS.length];
      out.push(meadowFlower(fx, y, color));
    }

    // Mushrooms (was drawBackgroundNature lines 453-454)
    out.push(meadowMushroom(240, y));
    out.push(meadowMushroom(720, y));

    // Floating-platform decorations (was drawBackgroundNature lines 457-470)
    const floats = getFloatingPlatforms(arena.platforms);
    for (const plat of floats) {
      const mid = plat.x + plat.width / 2;
      if (plat.width > 180) {
        out.push(meadowBush(mid - 30, plat.y, 15));
        out.push(meadowFlower(plat.x + 20, plat.y, '#FFD700'));
        out.push(meadowFlower(plat.x + plat.width - 25, plat.y, '#FF69B4'));
        out.push(meadowGrassTuft(plat.x + 10, plat.y));
        out.push(meadowGrassTuft(plat.x + plat.width - 15, plat.y));
      } else {
        out.push(meadowFlower(mid - 10, plat.y, '#DDA0DD'));
        out.push(meadowGrassTuft(plat.x + 8, plat.y));
      }
    }

    return out;
  },
```

- [ ] **Step 3: Strip the migrated lines from `drawBackgroundNature`**

In `meadowPack.drawBackgroundNature`, delete lines 433-470 (the trees, bushes, flowers, mushrooms, and floating-platform decoration calls). The function becomes empty:

```typescript
  drawBackgroundNature: (_ctx: CanvasRenderingContext2D, _arena: Arena) => {
    // All meadow background-nature decorations migrated to buildReactiveDecorations.
  },
```

(Underscore-prefix the unused params to satisfy `noUnusedParameters` if it's enabled.)

- [ ] **Step 4: Typecheck + run meadow tests**

```bash
npx tsc -b 2>&1 | tail -5
npx vitest run src/engine/arenas/packs/__tests__/meadow.test.ts 2>&1 | tail -10
```
Expected: typecheck clean. If meadow.test.ts has assertions about background-nature draw calls, they may need updating — read the file and adapt.

- [ ] **Step 5: Manual visual check**

```bash
npm run dev
```
Open `http://localhost:5173/bunnybrawl/?arena=meadow&bots=2&killLimit=4`. Verify trees, bushes, flowers, mushrooms still render. They should look identical to current main except:
- Trees now sway slightly with wind (subtle).
- Stomping near a tree shakes it briefly (test by killing a bot near a tree).
- Heavy stomp emits a small leaf burst.

If trees are missing or in wrong positions, debug — likely an off-by-one in the migration. Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/engine/arenas/packs/meadow.ts
git commit -m "$(cat <<'EOF'
reactive(meadow): migrate ground decorations — tree, bush, flower, mushroom, grassTuft

5 kinds registered with prefixed names (meadow.tree, etc.). Trees sway in
wind, shake on stomp, burst leaves on heavy shake. Bushes/flowers/mushrooms/
grass tufts sway only. drawBackgroundNature emptied — all positions now in
buildReactiveDecorations factory list (40 instances total: 3 trees + 5 bushes
+ 10 flowers + 2 mushrooms + per-platform extras).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Sub-task 8.2: Foreground static decorations — fgBush, tallGrass, fern, hangingVine, fgLeafCluster, fgWildflower

- [ ] **Step 1: Add factories + draw fns + registrations**

Add to the `meadow.ts` reactive section (continuing from sub-task 8.1):

```typescript
// ---- meadow.fgBush ----
const _fgBushSize = new Map<ReactiveInstance, number>();
function meadowFgBush(x: number, y: number, size: number): ReactiveInstance {
  const inst: ReactiveInstance = {
    pos: { x, y }, kind: 'meadow.fgBush',
    seed: Math.floor((x * 67 + y * 23) % 997),
    windAmp: 2.5,
    excitement: 0, shakeDecay: 0,
  };
  _fgBushSize.set(inst, size);
  return inst;
}
registerReactiveKind('meadow.fgBush', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    const size = _fgBushSize.get(inst) ?? 40;
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase * 0.7, inst.pos.y);
    drawFgBush(ctx, 0, 0, size);
    ctx.restore();
  },
});

// ---- meadow.tallGrass ----
const _tallGrassCount = new Map<ReactiveInstance, number>();
function meadowTallGrass(x: number, y: number, count: number): ReactiveInstance {
  const inst: ReactiveInstance = {
    pos: { x, y }, kind: 'meadow.tallGrass',
    seed: Math.floor((x * 89 + y * 41) % 997),
    windAmp: 3.5,
    proximity: { radius: 24, mode: 'flee', magnitude: 14 },
    excitement: 0, shakeDecay: 0,
  };
  _tallGrassCount.set(inst, count);
  return inst;
}
registerReactiveKind('meadow.tallGrass', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    const count = _tallGrassCount.get(inst) ?? 7;
    // Apply parting offset based on excitement: shift away from the player.
    // We don't store the player direction; use a simple horizontal nudge.
    const partOffset = inst.excitement * 14 * Math.sign(swayPhase || 1);
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase + partOffset, inst.pos.y);
    drawTallGrass(ctx, 0, 0, count);
    ctx.restore();
  },
});

// ---- meadow.fern ----
function meadowFern(x: number, y: number): ReactiveInstance {
  return {
    pos: { x, y }, kind: 'meadow.fern',
    seed: Math.floor((x * 79 + y * 37) % 997),
    windAmp: 3,
    proximity: { radius: 24, mode: 'flee', magnitude: 12 },
    excitement: 0, shakeDecay: 0,
  };
}
registerReactiveKind('meadow.fern', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    const partOffset = inst.excitement * 12 * Math.sign(swayPhase || 1);
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase + partOffset, inst.pos.y);
    drawFern(ctx, 0, 0);
    ctx.restore();
  },
});

// ---- meadow.hangingVine ----
const _vineLength = new Map<ReactiveInstance, number>();
function meadowHangingVine(x: number, y: number, length: number): ReactiveInstance {
  const inst: ReactiveInstance = {
    pos: { x, y }, kind: 'meadow.hangingVine',
    seed: Math.floor((x * 97 + y * 47) % 997),
    windAmp: 5,
    proximity: { radius: 30, mode: 'lean', magnitude: 10 },
    excitement: 0, shakeDecay: 0,
  };
  _vineLength.set(inst, length);
  return inst;
}
registerReactiveKind('meadow.hangingVine', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    const length = _vineLength.get(inst) ?? 20;
    // Lean toward player (excitement * magnitude); sway is a base oscillation.
    const lean = inst.excitement * 10;
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase + lean, inst.pos.y);
    drawHangingVine(ctx, 0, 0, length);
    ctx.restore();
  },
});

// ---- meadow.fgLeafCluster ----
function meadowFgLeafCluster(x: number, y: number): ReactiveInstance {
  return {
    pos: { x, y }, kind: 'meadow.fgLeafCluster',
    seed: Math.floor((x * 103 + y * 53) % 997),
    windAmp: 4,
    excitement: 0, shakeDecay: 0,
  };
}
registerReactiveKind('meadow.fgLeafCluster', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase, inst.pos.y);
    drawFgLeafCluster(ctx, 0, 0);
    ctx.restore();
  },
});

// ---- meadow.fgWildflower ----
const _wildflowerStyle = new Map<ReactiveInstance, { color: string; size: number }>();
function meadowFgWildflower(x: number, y: number, color: string, size: number): ReactiveInstance {
  const inst: ReactiveInstance = {
    pos: { x, y }, kind: 'meadow.fgWildflower',
    seed: Math.floor((x * 109 + y * 59) % 997),
    windAmp: 2,
    excitement: 0, shakeDecay: 0,
  };
  _wildflowerStyle.set(inst, { color, size });
  return inst;
}
registerReactiveKind('meadow.fgWildflower', {
  layer: 'background',
  draw: (ctx, inst, swayPhase) => {
    const style = _wildflowerStyle.get(inst) ?? { color: '#FFD700', size: 18 };
    ctx.save();
    ctx.translate(inst.pos.x + swayPhase, inst.pos.y);
    drawFgWildflower(ctx, 0, 0, style.color, style.size);
    ctx.restore();
  },
});
```

- [ ] **Step 2: Append to `buildReactiveDecorations`**

Insert into the existing `buildReactiveDecorations` function in `meadowPack`, after the floating-platform decorations loop:

```typescript
    // Foreground bushes (was drawForegroundNature lines 478-481)
    out.push(meadowFgBush(160, y, 60));
    out.push(meadowFgBush(520, y, 52));
    out.push(meadowFgBush(1000, y, 55));
    out.push(meadowFgBush(1120, y, 48));

    // Tall grass clusters (was lines 484-487)
    out.push(meadowTallGrass(310, y, 7));
    out.push(meadowTallGrass(680, y, 9));
    out.push(meadowTallGrass(1020, y, 6));
    out.push(meadowTallGrass(430, y, 5));

    // Ferns (was lines 490-492)
    out.push(meadowFern(80, y));
    out.push(meadowFern(770, y));
    out.push(meadowFern(1220, y));

    // Floating-platform foreground decorations (was lines 495-508)
    for (let pi = 0; pi < floats.length; pi++) {
      const plat = floats[pi];
      if (plat.width > 180) {
        out.push(meadowFgBush(plat.x + plat.width * 0.15, plat.y, pi % 2 === 0 ? 45 : 18));
        out.push(meadowFgBush(plat.x + plat.width * 0.85, plat.y, pi % 2 === 0 ? 18 : 42));
        out.push(meadowHangingVine(plat.x + 15, plat.y + plat.height, 25));
        out.push(meadowHangingVine(plat.x + plat.width - 15, plat.y + plat.height, 20));
        out.push(meadowFgLeafCluster(plat.x + plat.width / 2, plat.y));
      } else {
        out.push(meadowFgBush(plat.x + plat.width * 0.5, plat.y, pi % 3 === 0 ? 38 : 16));
        out.push(meadowHangingVine(plat.x + plat.width / 2, plat.y + plat.height, 18));
      }
    }

    // Foreground wildflowers (was lines 511-514)
    out.push(meadowFgWildflower(240, y, '#FF6B8A', 18));
    out.push(meadowFgWildflower(580, y, '#DDA0DD', 20));
    out.push(meadowFgWildflower(930, y, '#FFD700', 16));
    out.push(meadowFgWildflower(1180, y, '#FF69B4', 22));
```

- [ ] **Step 3: Strip the migrated lines from `drawForegroundNature`**

Replace `drawForegroundNature` body with an empty stub:

```typescript
  drawForegroundNature: (_ctx: CanvasRenderingContext2D, _arena: Arena) => {
    // All meadow foreground-nature decorations migrated to buildReactiveDecorations.
  },
```

This will cause `_fgNatureCache` to bake an empty layer for meadow. Renderer's blit becomes a no-op draw of an empty bitmap — performance neutral.

- [ ] **Step 4: Typecheck + run tests + visual check**

```bash
npx tsc -b 2>&1 | tail -5
npm test 2>&1 | tail -10
npm run dev  # smoke test, then Ctrl-C
```

Open `?arena=meadow&bots=2`. Verify tall grass / ferns / vines / foreground bushes all render. Walk a player into tall grass — it should visibly part. Approach a hanging vine — it should lean toward the player. Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/engine/arenas/packs/meadow.ts
git commit -m "$(cat <<'EOF'
reactive(meadow): migrate foreground decorations — fgBush, tallGrass, fern, hangingVine, fgLeafCluster, fgWildflower

6 kinds. Tall grass + ferns part as players walk through (proximity flee).
Hanging vines lean toward passing players (proximity lean). Other kinds
sway in wind only. drawForegroundNature emptied; cache bakes blank layer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Sub-task 8.3: Migrate dandelion (proximity excite + seed burst)

The existing dandelion code (lines 622-706) is a 9-instance reactive entity with custom seed-burst animation driven by per-instance `_dandelionExcite` Float32Array. Re-express as kind=`meadow.dandelion` with `proximity: {mode: 'excite', radius: 40}` and a custom draw that consumes `inst.excitement` to drive the same burst-and-regrow cycle.

- [ ] **Step 1: Add factory + draw fn + registration**

```typescript
// ---- meadow.dandelion ----
// Per-instance burst phase: -1 = idle (full puff), >= 0 = burst-elapsed seconds.
// Stored in a side-channel Map keyed by the instance.
const _dandelionPhase = new Map<ReactiveInstance, number>();

function meadowDandelion(x: number, y: number): ReactiveInstance {
  return {
    pos: { x, y }, kind: 'meadow.dandelion',
    seed: Math.floor((x * 113 + y * 61) % 997),
    proximity: { radius: 40, mode: 'excite', magnitude: 1 },
    excitement: 0, shakeDecay: 0,
  };
}

const BURST_TOTAL = 7.0;
const SEED_FLY_DURATION = 2.0;

registerReactiveKind('meadow.dandelion', {
  layer: 'background',
  draw: (ctx, inst, _swayPhase, time) => {
    // Excitement rising → if we were idle, start a burst.
    let phase = _dandelionPhase.get(inst) ?? -1;
    if (phase < 0 && inst.excitement > 0.5) phase = 0;
    if (phase >= 0) {
      // Advance phase using time delta — for simplicity, a fixed advance per
      // call (~1/60s). Renderer calls this per frame so this gives ~60Hz step.
      phase += 1 / 60;
      if (phase >= BURST_TOTAL) phase = -1;
    }
    _dandelionPhase.set(inst, phase);

    const x = inst.pos.x;
    const gy = inst.pos.y;
    const puffY = gy - 9;

    // Stem.
    ctx.strokeStyle = '#5fb45a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, gy + 4);
    ctx.lineTo(x, gy - 8);
    ctx.stroke();

    // Puff (shrinks during seed-fly, regrows after).
    let puffR = 6;
    if (phase >= 0) {
      if (phase < SEED_FLY_DURATION) {
        puffR = 6 * Math.max(0, 1 - phase / 0.3);
      } else {
        const regrow = (phase - SEED_FLY_DURATION) / (BURST_TOTAL - SEED_FLY_DURATION);
        puffR = 6 * Math.min(1, regrow);
      }
    }
    if (puffR > 0.3) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(x, puffY, puffR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dcdcc8';
      ctx.globalAlpha = 0.75;
      for (let i = 0; i < 6; i++) {
        const c = DANDELION_SEED_COS[i * 2];
        const s = DANDELION_SEED_SIN[i * 2];
        ctx.beginPath();
        ctx.arc(x + c * puffR * 0.7, puffY + s * puffR * 0.7, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Seed-fly particles.
    if (phase >= 0 && phase < SEED_FLY_DURATION) {
      const t = phase / SEED_FLY_DURATION;
      const SEEDS = 12;
      ctx.fillStyle = '#f8f8e8';
      for (let i = 0; i < SEEDS; i++) {
        const emitT = i / SEEDS * 0.3;
        const localT = (t - emitT) / (1 - emitT);
        if (localT <= 0) continue;
        const angle = (i / SEEDS) * Math.PI * 2 + fastSin(time + i) * 0.2;
        const dist = localT * 60;
        const sx = x + fastCos(angle) * dist + fastSin(time * 1.5 + i) * 2;
        const sy = puffY - localT * 50 - localT * localT * 12 + fastSin(time + i) * 1.5;
        const alpha = (1 - localT) * 0.95;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath();
        ctx.arc(sx, sy - 2.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  },
});
```

- [ ] **Step 2: Append dandelion instances to `buildReactiveDecorations`**

```typescript
    // Dandelions (was DANDELIONS array + drawAnimatedBackground)
    for (const d of DANDELIONS) {
      out.push(meadowDandelion(d.x, d.gy));
    }
```

- [ ] **Step 3: Strip the dandelion logic from `drawAnimatedBackground`**

Replace the entire body of `drawAnimatedBackground` (lines 622-706) with an empty arrow function — or delete the field if nothing else lives there:

```typescript
  // drawAnimatedBackground removed — dandelions migrated to ReactiveDecorationSystem.
```

(Confirm by reading the function body that nothing else lived there. The block from 622-706 appears to be only dandelion logic.)

- [ ] **Step 4: Drop the now-unused module-scoped state**

The following can be removed from the top of `meadow.ts`:
- `const _dandelionExcite = new Float32Array(DANDELIONS.length).fill(-1);` (line 41)
- `const _tickDandelionDt = makeDtTracker();` (line 42)

Keep `DANDELIONS`, `DANDELION_SEED_COS`, `DANDELION_SEED_SIN` — used by `buildReactiveDecorations` and the new draw fn.

- [ ] **Step 5: Typecheck + tests + visual**

```bash
npx tsc -b 2>&1 | tail -5
npm test 2>&1 | tail -10
npm run dev
```

Visual check: walk a player near a dandelion (within 40px). Puff should shrink; seeds fly out and drift up; puff regrows over ~5s. Same behavior as before. Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/engine/arenas/packs/meadow.ts
git commit -m "$(cat <<'EOF'
reactive(meadow): migrate dandelions to proximity-excite kind

9 dandelions registered as meadow.dandelion (proximity radius 40, mode
'excite'). Per-instance burst phase tracked in a side-channel Map. Same
shrink-fly-regrow visual as before, driven by inst.excitement instead of
the old _dandelionExcite Float32Array. drawAnimatedBackground emptied.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Sub-task 8.4: Migrate butterflies + bees (foreground layer + flock proximity flee)

These render in the FOREGROUND layer (post-player) — per the existing `drawAnimatedForeground` slot. Use 60Hz update so flock motion stays smooth.

- [ ] **Step 1: Add factories + draw fns + registrations**

```typescript
// ---- meadow.butterfly ----
const _butterflyIndex = new Map<ReactiveInstance, number>();
function meadowButterfly(idx: number): ReactiveInstance {
  // Position is dynamic (computed in draw via time), pos here is just a
  // dummy anchor; proximity radius is large since flock motion shifts pos.
  const inst: ReactiveInstance = {
    pos: { x: 0, y: 0 }, kind: 'meadow.butterfly',
    seed: idx,
    proximity: { radius: 70, mode: 'flee', magnitude: 14 },
    excitement: 0, shakeDecay: 0,
  };
  _butterflyIndex.set(inst, idx);
  return inst;
}
registerReactiveKind('meadow.butterfly', {
  layer: 'foreground',
  highFrequency: true, // flock motion needs 60Hz
  draw: (ctx, inst, _swayPhase, time, _dayPhase) => {
    const i = _butterflyIndex.get(inst) ?? 0;
    // Inline the existing drawButterfly logic, but re-derive position from time
    // (instead of calling pushFromPlayers, since the system already computed
    // excitement). For PR 1, keep the original drawButterfly call site verbatim.
    drawButterfly(ctx, i, time, []); // empty players: excitement-driven push lives in proximity
    // TODO(future): plumb proximity-driven offset through the draw fn so the
    // empty players[] doesn't lose the existing flee behavior.
  },
});
```

**WAIT — the existing `drawButterfly` reads `players` directly via `pushFromPlayers`.** The naive port above passes `[]`, losing the flee behavior. For PR 1, **keep** the existing `drawButterfly` taking real `players`, but pull `players` from `state.players` via a side-channel.

The clean fix: extend the `ReactiveDraw` callback signature to include `state` so draw fns can read live data when they need to. Add `state: MatchState` as the 6th arg.

- [ ] **Step 1a: Extend ReactiveDraw signature**

In `src/engine/gameLoop/cosmetics/reactiveDecorations.ts`, update the type:

```typescript
export type ReactiveDraw = (
  ctx: CanvasRenderingContext2D,
  instance: ReactiveInstance,
  swayPhase: number,
  time: number,
  dayPhase: number,
  state: import('../../types').MatchState,
) => void;
```

- [ ] **Step 1b: Update Renderer's `_drawReactiveLayer` to forward state**

```typescript
      cfg.draw(ctx, inst, swayPhase, time, dayPhase, matchState);
```

(That's the line in `_drawReactiveLayer` from Task 7.)

- [ ] **Step 1c: Update meadow draw fns**

Add `_state` (or `state` if used) as the trailing param to every `draw:` arrow function defined in meadow.ts. For most fns it's `_state` (unused).

For butterflies and bees, use the real `state.players`:

```typescript
registerReactiveKind('meadow.butterfly', {
  layer: 'foreground',
  highFrequency: true,
  draw: (ctx, inst, _swayPhase, time, _dayPhase, state) => {
    const i = _butterflyIndex.get(inst) ?? 0;
    drawButterfly(ctx, i, time, state.players);
  },
});

// ---- meadow.bee ----
const _beeClusterIndex = new Map<ReactiveInstance, number>();
function meadowBeeCluster(idx: number): ReactiveInstance {
  const inst: ReactiveInstance = {
    pos: { x: BEE_CLUSTERS[idx].homeX, y: BEE_CLUSTERS[idx].homeY }, kind: 'meadow.bee',
    seed: idx,
    proximity: { radius: 110, mode: 'flee', magnitude: 28 },
    excitement: 0, shakeDecay: 0,
  };
  _beeClusterIndex.set(inst, idx);
  return inst;
}
registerReactiveKind('meadow.bee', {
  layer: 'foreground',
  highFrequency: true,
  draw: (ctx, inst, _swayPhase, time, _dayPhase, state) => {
    const ci = _beeClusterIndex.get(inst) ?? 0;
    drawBeeCluster(ctx, ci, time, state.players);
  },
});
```

- [ ] **Step 2: Append butterfly + bee instances to `buildReactiveDecorations`**

```typescript
    // Butterflies (was drawAnimatedForeground line 717)
    for (let i = 0; i < BUTTERFLY_HUES.length; i++) out.push(meadowButterfly(i));
    // Bee clusters (was drawAnimatedForeground line 718)
    for (let ci = 0; ci < BEE_CLUSTERS.length; ci++) out.push(meadowBeeCluster(ci));
```

- [ ] **Step 3: Strip butterflies + bees from `drawAnimatedForeground`**

Lines 713-720 currently call `drawButterfly` and `drawBeeCluster` directly. Empty out the body:

```typescript
  // drawAnimatedForeground removed — butterflies + bees migrated to ReactiveDecorationSystem.
```

(Confirm nothing else lives in that function.)

- [ ] **Step 4: Typecheck + tests + visual**

```bash
npx tsc -b 2>&1 | tail -5
npm test 2>&1 | tail -10
npm run dev
```

Open `?arena=meadow&bots=2`. Verify butterflies + bees fly above the scene, render IN FRONT of players, flee when players approach. Should look identical to before.

- [ ] **Step 5: Commit**

```bash
git add src/engine/arenas/packs/meadow.ts src/engine/gameLoop/cosmetics/reactiveDecorations.ts src/engine/renderer.ts
git commit -m "$(cat <<'EOF'
reactive(meadow): migrate butterflies + bees to foreground layer + 60Hz

8 butterflies + 2 bee clusters registered with layer:'foreground' and
highFrequency:true. ReactiveDraw signature extended to receive MatchState
so flock draws still read state.players directly via pushFromPlayers.
drawAnimatedForeground emptied.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Sub-task 8.5: Meadow smoke test

- [ ] **Step 1: Write the test**

Create `src/engine/arenas/packs/__tests__/meadow-decorations.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack, getArena, getTheme } from '../../operations';
import { hasReactiveKind, getReactiveKind } from '../../../gameLoop/cosmetics';

beforeAll(() => {
  registerBuiltinArenas();
});

describe('meadow — buildReactiveDecorations', () => {
  it('builds a non-empty instance list', () => {
    const pack = getArenaPack('meadow');
    expect(pack).toBeDefined();
    const arena = getArena('meadow');
    const list = pack!.buildReactiveDecorations!(arena);
    expect(list.length).toBeGreaterThan(40); // 3 trees + 5 bushes + 10 flowers + 9 dandelions + 8 butterflies + ...
  });

  it('every instance has a registered kind', () => {
    const pack = getArenaPack('meadow');
    const arena = getArena('meadow');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(hasReactiveKind(inst.kind)).toBe(true);
    }
  });

  it('every instance position is within arena bounds', () => {
    const pack = getArenaPack('meadow');
    const arena = getArena('meadow');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(inst.pos.x).toBeGreaterThanOrEqual(-50); // some hang off-edge slightly
      expect(inst.pos.x).toBeLessThanOrEqual(arena.width + 50);
      expect(inst.pos.y).toBeGreaterThanOrEqual(0);
      expect(inst.pos.y).toBeLessThanOrEqual(arena.height + 50);
    }
  });

  it('expected kinds are present', () => {
    const expected = [
      'meadow.tree', 'meadow.bush', 'meadow.flower', 'meadow.mushroom',
      'meadow.grassTuft', 'meadow.fgBush', 'meadow.tallGrass', 'meadow.fern',
      'meadow.hangingVine', 'meadow.fgLeafCluster', 'meadow.fgWildflower',
      'meadow.dandelion', 'meadow.butterfly', 'meadow.bee',
    ];
    for (const k of expected) {
      expect(hasReactiveKind(k)).toBe(true);
    }
  });

  it('butterflies + bees register as foreground + highFrequency', () => {
    const butterfly = getReactiveKind('meadow.butterfly');
    expect(butterfly?.layer).toBe('foreground');
    expect(butterfly?.highFrequency).toBe(true);
    const bee = getReactiveKind('meadow.bee');
    expect(bee?.layer).toBe('foreground');
    expect(bee?.highFrequency).toBe(true);
  });

  it('renders without errors at multiple windPhase slices', () => {
    const pack = getArenaPack('meadow');
    const arena = getArena('meadow');
    const list = pack!.buildReactiveDecorations!(arena);
    const ctx = {
      save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
      scale: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
      arc: () => {}, ellipse: () => {}, fill: () => {}, stroke: () => {},
      fillRect: () => {}, quadraticCurveTo: () => {}, fillStyle: '', strokeStyle: '',
      lineWidth: 0, globalAlpha: 1, lineCap: '',
    } as unknown as CanvasRenderingContext2D;
    const fakeState = { players: [], timeElapsed: 0, dayPhase: 0 } as never;
    for (const slice of [0, 0.5, 1.0, 5.0]) {
      for (const inst of list) {
        const cfg = getReactiveKind(inst.kind)!;
        // sway phase = sin(slice + seed * 0.7) * (windAmp ?? 0)
        const sway = Math.sin(slice + inst.seed * 0.7) * (inst.windAmp ?? 0);
        expect(() => cfg.draw(ctx, inst, sway, 0, 0, fakeState)).not.toThrow();
      }
    }
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run src/engine/arenas/packs/__tests__/meadow-decorations.test.ts
```
Expected: PASS — 6 tests green.

- [ ] **Step 3: Commit**

```bash
git add src/engine/arenas/packs/__tests__/meadow-decorations.test.ts
git commit -m "$(cat <<'EOF'
reactive(meadow): smoke test for buildReactiveDecorations

Asserts non-empty list, all kinds registered, positions in bounds, expected
kind names present, butterfly/bee correctly flagged foreground+60Hz, draws
don't throw across windPhase slices.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Underwater bubble trails via `cosmeticTick`

**Files:**
- Modify: `src/engine/arenas/packs/underwater.ts`
- Create: `src/engine/arenas/packs/__tests__/underwater-bubbles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/engine/arenas/packs/__tests__/underwater-bubbles.test.ts`:

```typescript
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../operations';
import { makeArena, makeState, makePlayer } from '../../../__tests__/testHelpers';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

beforeAll(() => {
  registerBuiltinArenas();
});

describe('underwater — cosmeticTick (bubble trails)', () => {
  it('emits bubbles when player moves with vx > 50', () => {
    const pack = getArenaPack('underwater');
    expect(pack).toBeDefined();
    expect(pack!.cosmeticTick).toBeDefined();

    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 100, y: 400, vx: 80, vy: 0 })],
    });
    const emitParticle = vi.fn();
    // Tick repeatedly — first call should emit (after threshold accum).
    let emitted = 0;
    for (let i = 0; i < 50; i++) {
      pack!.cosmeticTick!(state, 1 / 30, { emitParticle });
      emitted = emitParticle.mock.calls.length;
      if (emitted > 0) break;
    }
    expect(emitted).toBeGreaterThan(0);
  });

  it('does not emit when player vx is below threshold', () => {
    const pack = getArenaPack('underwater');
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 100, y: 400, vx: 30, vy: 0 })],
    });
    const emitParticle = vi.fn();
    for (let i = 0; i < 50; i++) {
      pack!.cosmeticTick!(state, 1 / 30, { emitParticle });
    }
    expect(emitParticle).not.toHaveBeenCalled();
  });

  it('does not emit for inactive or splat players', () => {
    const pack = getArenaPack('underwater');
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400, vx: 200, vy: 0, active: false }),
        makePlayer({ id: 'P2', x: 200, y: 400, vx: 200, vy: 0, state: 'splat' }),
      ],
    });
    const emitParticle = vi.fn();
    for (let i = 0; i < 50; i++) {
      pack!.cosmeticTick!(state, 1 / 30, { emitParticle });
    }
    expect(emitParticle).not.toHaveBeenCalled();
  });

  it('throttles bubble emission per player', () => {
    const pack = getArenaPack('underwater');
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 100, y: 400, vx: 200, vy: 0 })],
    });
    const emitParticle = vi.fn();
    // Run 30 ticks at dt=1/30 = 1 second elapsed. Throttle is 0.08s/emit
    // so at most ceil(1.0 / 0.08) = 13 emits. Allow some slack.
    for (let i = 0; i < 30; i++) {
      pack!.cosmeticTick!(state, 1 / 30, { emitParticle });
    }
    expect(emitParticle.mock.calls.length).toBeLessThan(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/engine/arenas/packs/__tests__/underwater-bubbles.test.ts
```
Expected: FAIL — `pack.cosmeticTick` is undefined.

- [ ] **Step 3: Add `cosmeticTick` to underwater pack**

In `src/engine/arenas/packs/underwater.ts`, add at the top of the file (after the existing imports):

```typescript
import type { PlayerSlot } from '../../types';
import { getSlowDevice } from '../../perfFlags';
```

(`getSlowDevice` may already be imported; check and reuse if so.)

Below the existing module-level data (e.g. after `_crabs` and `_tickCrabDt`), add bubble-trail state:

```typescript
// ---- Bubble trails (env-wakes from Batch D) ----
const _bubbleAccum = new Map<PlayerSlot, number>();
const BUBBLE_INTERVAL = 0.08; // seconds between bubble emits per player
const BUBBLE_VX_THRESHOLD = 50;
```

In the underwater pack object literal, add the `cosmeticTick` field — place it alongside the other animation hooks (after `drawAnimatedForeground`):

```typescript
  cosmeticTick: (state, dt, services) => {
    if (getSlowDevice()) return;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
      if (Math.abs(p.vx) < BUBBLE_VX_THRESHOLD) continue;

      const next = (_bubbleAccum.get(p.id) ?? 0) - dt;
      if (next > 0) { _bubbleAccum.set(p.id, next); continue; }
      _bubbleAccum.set(p.id, BUBBLE_INTERVAL);

      // Emit one bubble behind the player at hip height.
      const offsetX = p.facing === 'right' ? -p.width * 0.5 : p.width * 0.5;
      const bx = p.x + p.width * 0.5 + offsetX;
      const by = p.y + p.height * 0.6;
      const size = 1 + Math.random() * 2;
      const drift = (Math.random() - 0.5) * 8;
      // emitParticle(x, y, vx, vy, life, size, color)
      services.emitParticle(bx, by, drift, -30, 1.2 + Math.random() * 0.4, size, 'rgba(180,230,255,0.55)');
    }
  },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/engine/arenas/packs/__tests__/underwater-bubbles.test.ts
```
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Manual visual check**

```bash
npm run dev
```
Open `?arena=underwater&bots=2`. Move the player horizontally; verify a stream of small pale bubbles emits behind the player and rises. Move slowly (or stand still); no bubbles. Toggle slow-device via the settings modal; bubbles disappear. Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/engine/arenas/packs/underwater.ts src/engine/arenas/packs/__tests__/underwater-bubbles.test.ts
git commit -m "$(cat <<'EOF'
reactive(underwater): bubble trails via cosmeticTick

Per-arena cosmeticTick hook spawns small pale-cyan bubbles behind moving
players (vx threshold 50). Throttled to one emit every 0.08s per player.
Slow-device gated. State (per-slot accumulator Map) lives in module-local
closure inside underwater.ts. Replaces the env-wakes effect originally
specced in Batch D — same behavior, owned by the arena pack instead of
EnvironmentSystem.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run full test suite**

```bash
npm test 2>&1 | tail -25
```
Expected: ~2000 tests pass. Pre-existing flakes unchanged (per CLAUDE.md "Testing" section: `MainMenu.test.tsx` logo import, `VictoryScreen.test.tsx`, `switchArena` spawn-point flake, `integration.test.ts > network mode round-trip > fixedUpdate with explicit inputMap`). No NEW failures.

- [ ] **Step 2: Run `tsc -b`**

```bash
npx tsc -b 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 3: Manual smoke — meadow**

```bash
npm run dev
```
Open `http://localhost:5173/bunnybrawl/?arena=meadow&bots=2&killLimit=4`. Verify:
- Trees + bushes + flowers + mushrooms render at ground level (familiar positions).
- Tall grass / ferns / hanging vines / fg bushes render as before.
- Trees sway subtly in wind.
- Walking through tall grass parts the blades.
- Approaching a hanging vine makes it lean toward you.
- Stomping a bot near a tree shudders it; heavy stomp emits leaf burst.
- Dandelions still puff and regrow when a player approaches.
- Butterflies + bees fly above the scene, IN FRONT of players, flee on approach.

- [ ] **Step 4: Manual smoke — underwater**

Open `http://localhost:5173/bunnybrawl/?arena=underwater&bots=2`. Verify:
- Existing fish + coral + kelp + currents all still work (no regressions from underwater pack changes).
- Moving the player horizontally emits a stream of bubbles behind them, rising upward.
- Standing still emits no bubbles.

- [ ] **Step 5: Manual smoke — slow-device**

Open settings modal, enable "Slow device". Replay meadow:
- Wind sway stops (trees stand still).
- Tall grass doesn't part on player walkthrough.
- Stomp shake doesn't fire.
- Dandelions don't react.
- Butterflies/bees behavior depends on whether `_drawReactiveLayer` zeroes 60Hz updates too — sub-task observation: per spec "decide during PR 1". For PR 1 I left the 60Hz cosmeticUpdate path also gated on getSlowDevice via the same _tickBucket check. Verify butterflies stay visible but stop fleeing on slow-device. If they freeze entirely (no flock motion), that's also acceptable per spec.

Underwater bubble trails: confirm no bubbles emit on slow-device.

Stop dev server.

- [ ] **Step 6: E2E sanity**

```bash
npm run test:e2e -- --grep "@meadow|reactive"
```
Expected: all matching tests pass. If no E2E tests match those tags, run a representative arena E2E to confirm the renderer-integration didn't break in-browser:

```bash
npm run test:e2e -- e2e/match.spec.ts
```

- [ ] **Step 7: Branch summary**

```bash
git log --oneline main..HEAD
```
Expected: ~10 commits matching the task headings:
1. `reactive: pure helpers — ReactiveInstance, kind registry, primitive math`
2. `reactive: ReactiveDecorationSystem class — bucketing + primitives wiring`
3. `reactive: ArenaPack.buildReactiveDecorations + cosmeticTick fields`
4. `reactive: TransitionCallbacks.onStomp — optional stomp event hook`
5. `reactive: GameLoop wiring — construct, tick, stomp + cosmeticTick`
6. `reactive: Renderer integration — pre-player + post-player draw slots`
7. `reactive(meadow): migrate ground decorations — tree, bush, flower, mushroom, grassTuft`
8. `reactive(meadow): migrate foreground decorations — fgBush, tallGrass, fern, hangingVine, fgLeafCluster, fgWildflower`
9. `reactive(meadow): migrate dandelions to proximity-excite kind`
10. `reactive(meadow): migrate butterflies + bees to foreground layer + 60Hz`
11. `reactive(meadow): smoke test for buildReactiveDecorations`
12. `reactive(underwater): bubble trails via cosmeticTick`

PR 1 is complete. Ready to open PR. Subsequent arena migrations (lobby, treetops, waterfall, underwater fish/kelp, candy, graveyard, rooftops, castle, volcano, winterLake, spaceStation) get their own PRs per the migration plan in the spec.

---

## Self-review notes

**Spec coverage check:**
- Foundation system + 4 primitives → Tasks 2, 3 ✓
- 60Hz vs 30Hz buckets → Task 3 ✓
- Per-kind registry with prefix convention → Task 2 ✓
- Two render layers (background + foreground) → Task 7 ✓
- ArenaPack.buildReactiveDecorations + cosmeticTick → Task 4 ✓
- Stomp impulse wiring → Task 5, integrated in 6 ✓
- Burst → ParticleSystem.emitParticle → Task 6 ✓
- Slow-device gating → Tasks 3 (_tickBucket), 7 (Renderer), 9 (cosmeticTick) ✓
- Meadow migration of all 14 decoration kinds → Task 8 sub-tasks ✓
- Underwater bubble trails → Task 9 ✓
- Smoke tests + unit tests → Tasks 2, 3, 8.5, 9 ✓

**Placeholder scan:** No TBDs, TODOs (one comment-form TODO in butterfly draw fn body resolved in 1c), or vague phrases. Every step has concrete code.

**Type consistency:** `ReactiveInstance`, `ReactiveLayer`, `ReactiveDraw`, `ReactiveKindConfig` defined in Task 2, used consistently through Tasks 3, 6, 7, 8. `BurstEmitter` defined in Task 3 alongside the system class. `ArenaCosmeticServices` defined in Task 4, consumed by `cosmeticTick` callers in Tasks 6 and 9.

**One known follow-up (called out in code, not blocking PR 1):**
- Side-channel `Map<ReactiveInstance, T>` for per-instance custom data (tree size, bush size, flower color, etc.) is functional but not the prettiest. Future iteration: extend `ReactiveInstance` with a typed `data?: unknown` field, or per-kind subclasses. Defer until a second arena migration shows whether the pattern proves itself.
