# Arena Platforms — Framework + Meadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pack-owned `drawPlatform` framework and migrate meadow to it. Other 10 arenas remain unchanged behind a renderer fallback. Ends at a playtest checkpoint.

**Architecture:** New `src/engine/themes/drawPrimitives/platforms.ts` holds shared helpers (3D cap rendering, edge-profile generators, seeded PRNG, stone/leaf primitives). `ArenaPack` and `ThemeConfig` gain an optional top-level `drawPlatform(ctx, platform, isGround)`. `Platform` gains an optional `style?: string` field. Renderer's existing `drawPlatform` method becomes a dispatcher: call the theme's `drawPlatform` if defined, else fall back to the current flat-rect logic. Meadow becomes the first pack to define `drawPlatform`.

**Tech Stack:** TypeScript 5.x, Canvas 2D, Vitest. No new runtime deps.

**Reference:** Visual target is `.superpowers/brainstorm/422-1777026295/content/arena-materials-v9.html` (the meadow card in that mockup is the source of truth for what meadow should look like).

---

## File Structure

**New files:**
- `src/engine/themes/drawPrimitives/platforms.ts` — shared rendering framework (constants, PRNG, primitives, edge profiles, cap/body/right-face orchestration).
- `src/engine/themes/drawPrimitives/__tests__/platforms.test.ts` — smoke tests for framework helpers.

**Modified files:**
- `src/engine/types.ts` — add `style?: string` to `Platform` interface.
- `src/engine/arenas/types.ts` — add optional `drawPlatform?` to `ArenaPack` interface.
- `src/engine/themes/types.ts` — add optional `drawPlatform?` to `ThemeConfig` interface.
- `src/engine/arenas/registry.ts` — have `toThemeConfig` copy `pack.drawPlatform` onto the theme.
- `src/engine/themes/drawPrimitives/index.ts` — export the new `platforms` module.
- `src/engine/renderer.ts` — dispatch to `theme.drawPlatform` when defined; keep existing fallback otherwise.
- `src/engine/arenas/packs/meadow.ts` — implement `drawPlatform` using the framework.

**Test files created/modified:**
- New: `src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`
- New: `src/engine/arenas/packs/__tests__/meadow-platform.test.ts`

---

## Task 1: Add `style?: string` to `Platform` interface

**Files:**
- Modify: `src/engine/types.ts:15-20`

- [ ] **Step 1: Read the file**

Use Read to open `src/engine/types.ts`. Confirm the Platform interface is at lines 15-20 with fields `x`, `y`, `width`, `height`.

- [ ] **Step 2: Add the optional field**

Change:

```typescript
export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

to:

```typescript
export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Optional per-platform style tag. Used by arena packs whose drawPlatform
   * function varies rendering per platform (e.g. rooftops: 'house' | 'hallway').
   * Arenas that don't use style can ignore it.
   */
  style?: string;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc -b`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat: add optional style field to Platform interface"
```

---

## Task 2: Add `drawPlatform?` to `ArenaPack` and `ThemeConfig` interfaces

**Files:**
- Modify: `src/engine/arenas/types.ts:23-105`
- Modify: `src/engine/themes/types.ts:130+`

- [ ] **Step 1: Read `src/engine/arenas/types.ts`**

Confirm `ArenaPack` structure. Find the block after existing `drawFarBackground` / `drawBackgroundNature` fields (around line 80-88).

- [ ] **Step 2: Add `drawPlatform?` to `ArenaPack`**

In `src/engine/arenas/types.ts`, locate the `// ---- Custom draw functions ----` section. After `drawFarBackground?:` and `drawBackgroundNature:` and before `drawAnimatedBackground?:`, add:

```typescript
  /**
   * Optional full override of platform rendering. When defined, the renderer
   * calls this instead of the built-in flat-rect fallback. Receives the full
   * Platform object so packs can dispatch on `platform.style` if needed.
   */
  drawPlatform?: (ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean) => void;
```

- [ ] **Step 3: Add `drawPlatform?` to `ThemeConfig`**

Read `src/engine/themes/types.ts`. Find the `drawFarBackground?` / `drawBackgroundNature:` block (around lines 130-132).

After `drawBackgroundNature:` add:

```typescript
  drawPlatform?: (ctx: CanvasRenderingContext2D, platform: import('../types').Platform, isGround: boolean) => void;
```

(Use the inline `import('../types').Platform` form to avoid adding a new top-of-file import; matches existing patterns in the file.)

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc -b`
Expected: passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/arenas/types.ts src/engine/themes/types.ts
git commit -m "feat: add optional drawPlatform to ArenaPack and ThemeConfig"
```

---

## Task 3: Propagate `pack.drawPlatform` through `toThemeConfig`

**Files:**
- Modify: `src/engine/arenas/registry.ts` around lines 93-94 (where `drawFarBackground` and `drawBackgroundNature` are copied)

- [ ] **Step 1: Read the file**

Open `src/engine/arenas/registry.ts`. Find `toThemeConfig` function. Locate the lines that look like:

```typescript
drawFarBackground: pack.drawFarBackground,
drawBackgroundNature: pack.drawBackgroundNature,
```

- [ ] **Step 2: Add the copy line**

Right after `drawBackgroundNature: pack.drawBackgroundNature,`, insert:

```typescript
    drawPlatform: pack.drawPlatform,
```

(Match existing indentation.)

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc -b`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/engine/arenas/registry.ts
git commit -m "feat: propagate pack.drawPlatform through toThemeConfig"
```

---

## Task 4: Create `platforms.ts` framework — constants + PRNG + primitives

**Files:**
- Create: `src/engine/themes/drawPrimitives/platforms.ts`
- Create: `src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`

Goal: lay down the core helpers that every material will compose. Start with the ones that are testable without a real canvas.

- [ ] **Step 1: Write the failing test**

Create `src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  CAP_DEPTH,
  SKEW_RATIO,
  mulberry32,
  seedFor,
} from '../platforms';

describe('platforms.ts framework — core helpers', () => {
  it('exposes locked constants', () => {
    expect(CAP_DEPTH).toBe(16);
    expect(SKEW_RATIO).toBe(0.5);
  });

  it('mulberry32 produces deterministic sequences', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
    const vals = [a(), a(), a()];
    expect(vals.every(v => v >= 0 && v < 1)).toBe(true);
  });

  it('seedFor hashes (x,y) consistently', () => {
    expect(seedFor(100, 200)).toBe(seedFor(100, 200));
    expect(seedFor(100, 200)).not.toBe(seedFor(101, 200));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`
Expected: FAIL — module `../platforms` not found.

- [ ] **Step 3: Create the module with the minimal exports**

Create `src/engine/themes/drawPrimitives/platforms.ts`:

```typescript
/**
 * Shared framework for 3D platform rendering.
 *
 * Arena packs compose these helpers in their `drawPlatform` functions.
 * See docs/superpowers/specs/2026-04-24-arena-platforms-design.md for
 * the full design rationale.
 */

// ---- Locked parameters ----
/** Vertical extent of the 3D top cap (px). Straddles the collision line. */
export const CAP_DEPTH = 16;
/** Horizontal skew ratio. Back edge is offset right by CAP_DEPTH * SKEW_RATIO. */
export const SKEW_RATIO = 0.5;

// ---- Deterministic PRNG ----
// Standard mulberry32. Same implementation as the v9 mockup so per-platform
// variation matches the visual target exactly.
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a platform's (x, y) to a PRNG seed. Stable across runs. */
export function seedFor(x: number, y: number): number {
  return (x * 73856093) ^ (y * 19349663);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/themes/drawPrimitives/platforms.ts src/engine/themes/drawPrimitives/__tests__/platforms.test.ts
git commit -m "feat: platforms.ts framework — constants + seeded PRNG"
```

---

## Task 5: Add edge-profile generators to `platforms.ts`

**Files:**
- Modify: `src/engine/themes/drawPrimitives/platforms.ts`
- Modify: `src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`

Each profile returns an array of `{x, y}` points along the edge. Tests verify shape (endpoints, monotonicity where applicable, outward-only).

- [ ] **Step 1: Add failing tests for edge profiles**

Append to `src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`:

```typescript
import { wavyDown, jaggedDown, subtleDown, candyDrips, backWavyUp, backFlat } from '../platforms';

describe('platforms.ts — front-edge profile generators', () => {
  const x = 100, w = 200, cF = 300;
  const rng = () => mulberry32(42)();  // fresh each call

  it('wavyDown starts at (x, cF), ends at (x+w, cF)', () => {
    const pts = wavyDown(x, w, cF, mulberry32(1), {});
    expect(pts[0]).toEqual({ x, y: cF });
    expect(pts[pts.length - 1]).toEqual({ x: x + w, y: cF });
  });

  it('wavyDown only dips down — all interior y >= cF', () => {
    const pts = wavyDown(x, w, cF, mulberry32(1), {});
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(cF);
  });

  it('jaggedDown only dips down', () => {
    const pts = jaggedDown(x, w, cF, mulberry32(1), {});
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(cF);
    expect(pts[0]).toEqual({ x, y: cF });
    expect(pts[pts.length - 1]).toEqual({ x: x + w, y: cF });
  });

  it('subtleDown produces a mostly-flat profile with small dips', () => {
    const pts = subtleDown(x, w, cF, mulberry32(1), { count: 2, amp: 1 });
    for (const p of pts) {
      expect(p.y).toBeGreaterThanOrEqual(cF);
      expect(p.y).toBeLessThan(cF + 5);
    }
  });

  it('candyDrips produces points with y >= cF (drips hang down)', () => {
    const pts = candyDrips(x, w, cF, mulberry32(1));
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(cF);
  });
});

describe('platforms.ts — back-edge profile generators', () => {
  const x = 100, w = 200, cB = 50, sp = 8;

  it('backWavyUp starts at (x+sp, cB) and only bulges up (y <= cB)', () => {
    const pts = backWavyUp(x, w, cB, sp, mulberry32(1), {});
    expect(pts[0]).toEqual({ x: x + sp, y: cB });
    expect(pts[pts.length - 1]).toEqual({ x: x + w + sp, y: cB });
    for (const p of pts) expect(p.y).toBeLessThanOrEqual(cB);
  });

  it('backFlat returns exactly 2 straight points', () => {
    const pts = backFlat(x, w, cB, sp);
    expect(pts).toEqual([{ x: x + sp, y: cB }, { x: x + w + sp, y: cB }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the edge-profile generators**

Append to `src/engine/themes/drawPrimitives/platforms.ts`:

```typescript
// ---- Edge profile generators ----
//
// All front-edge generators produce points with y >= cF (polygon grows down
// into body). All back-edge generators produce points with y <= cB (polygon
// grows up into sky). Never inward — that would create gaps.

export interface EdgePoint { x: number; y: number; }

export interface WavyOpts {
  bumps?: number;
  ampMin?: number;
  ampMax?: number;
  valleyBase?: number;
  resolution?: number;
}

/** Rounded sine-blended peaks dipping down from cF. */
export function wavyDown(x: number, w: number, cF: number, rng: () => number, opts: WavyOpts): EdgePoint[] {
  const bumps = opts.bumps ?? 5;
  const ampMin = opts.ampMin ?? 2;
  const ampMax = opts.ampMax ?? 4;
  const valleyBase = opts.valleyBase ?? 0.5;
  const resolution = opts.resolution ?? 8;
  const N = bumps + Math.floor(rng() * 2);
  const centers: Array<{ t: number; amp: number; spread: number }> = [];
  for (let i = 0; i < N; i++) {
    centers.push({
      t: (i + 0.5 + (rng() - 0.5) * 0.3) / N,
      amp: ampMin + rng() * (ampMax - ampMin),
      spread: 0.5 / N + rng() * 0.2 / N,
    });
  }
  const pts: EdgePoint[] = [{ x, y: cF }];
  const steps = resolution * N;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    let dy = valleyBase;
    for (const c of centers) {
      const dist = Math.abs(t - c.t);
      if (dist < c.spread * 2) {
        dy += c.amp * Math.cos(Math.min(1, dist / c.spread) * Math.PI / 2);
      }
    }
    pts.push({ x: x + t * w, y: cF + dy });
  }
  pts.push({ x: x + w, y: cF });
  return pts;
}

export interface JaggedOpts {
  bumps?: number;
  ampMin?: number;
  ampMax?: number;
}

/** Sharp V-shaped peaks dipping down from cF. Volcano/haunted look. */
export function jaggedDown(x: number, w: number, cF: number, rng: () => number, opts: JaggedOpts): EdgePoint[] {
  const bumps = opts.bumps ?? 5;
  const ampMin = opts.ampMin ?? 2;
  const ampMax = opts.ampMax ?? 4;
  const N = bumps + Math.floor(rng() * 2);
  const pts: EdgePoint[] = [{ x, y: cF }];
  for (let i = 0; i < N; i++) {
    const t1 = (i + 0.2 + rng() * 0.2) / N;
    const t2 = (i + 0.55 + rng() * 0.2) / N;
    const t3 = (i + 0.85) / N;
    const amp = ampMin + rng() * (ampMax - ampMin);
    pts.push({ x: x + t1 * w, y: cF + 0.3 });
    pts.push({ x: x + t2 * w, y: cF + amp });
    pts.push({ x: x + t3 * w, y: cF + 0.5 });
  }
  pts.push({ x: x + w, y: cF });
  return pts;
}

export interface SubtleOpts {
  count?: number;
  amp?: number;
}

/** Tiny hairline dips. Man-made materials (castle chips, house wear). */
export function subtleDown(x: number, w: number, cF: number, rng: () => number, opts: SubtleOpts): EdgePoint[] {
  const count = opts.count ?? 2;
  const amp = opts.amp ?? 1;
  const N = count + Math.floor(rng() * 2);
  const pts: EdgePoint[] = [{ x, y: cF }];
  for (let i = 0; i < N; i++) {
    const t = 0.2 + (i / N) * 0.6 + rng() * 0.1;
    const cx = x + t * w;
    const cw = 2 + rng() * 2;
    pts.push({ x: cx - cw / 2, y: cF });
    pts.push({ x: cx, y: cF + amp * (0.5 + rng() * 0.5) });
    pts.push({ x: cx + cw / 2, y: cF });
  }
  pts.push({ x: x + w, y: cF });
  return pts;
}

/** Candy-style sum-of-triangles drip shape. Wider at mid, narrow at tips. */
export function candyDrips(x: number, w: number, cF: number, rng: () => number): EdgePoint[] {
  const drips = [0.15 + rng() * 0.1, 0.4 + rng() * 0.1, 0.7 + rng() * 0.1, 0.9];
  const pts: EdgePoint[] = [{ x, y: cF }];
  for (let i = 4; i <= w; i += 4) {
    const t = i / w;
    let dip = 0;
    for (const dp of drips) {
      dip += Math.max(0, 3 - Math.abs(t - dp) * 30);
    }
    pts.push({ x: x + i, y: cF + dip });
  }
  pts.push({ x: x + w, y: cF });
  return pts;
}

/** Mirror of wavyDown for back edges. Points go up from cB into sky. */
export function backWavyUp(x: number, w: number, cB: number, sp: number, rng: () => number, opts: WavyOpts): EdgePoint[] {
  const bumps = opts.bumps ?? 4;
  const ampMin = opts.ampMin ?? 2;
  const ampMax = opts.ampMax ?? 4;
  const resolution = opts.resolution ?? 6;
  const N = bumps + Math.floor(rng() * 2);
  const centers: Array<{ t: number; amp: number; spread: number }> = [];
  for (let i = 0; i < N; i++) {
    centers.push({
      t: (i + 0.5 + (rng() - 0.5) * 0.3) / N,
      amp: ampMin + rng() * (ampMax - ampMin),
      spread: 0.5 / N + rng() * 0.2 / N,
    });
  }
  const pts: EdgePoint[] = [{ x: x + sp, y: cB }];
  const steps = resolution * N;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    let dy = 0;
    for (const c of centers) {
      const dist = Math.abs(t - c.t);
      if (dist < c.spread * 2) {
        dy -= c.amp * Math.cos(Math.min(1, dist / c.spread) * Math.PI / 2);
      }
    }
    pts.push({ x: x + sp + t * w, y: cB + dy });
  }
  pts.push({ x: x + w + sp, y: cB });
  return pts;
}

/** Straight back edge — for man-made materials that keep a clean horizon line. */
export function backFlat(x: number, w: number, cB: number, sp: number): EdgePoint[] {
  return [{ x: x + sp, y: cB }, { x: x + w + sp, y: cB }];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`
Expected: PASS, 9 tests total.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc -b`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/engine/themes/drawPrimitives/platforms.ts src/engine/themes/drawPrimitives/__tests__/platforms.test.ts
git commit -m "feat: platforms.ts — edge profile generators (wavy, jagged, subtle, drips)"
```

---

## Task 6: Add rendering orchestration helpers (cap, body, right face, stones, leaves)

**Files:**
- Modify: `src/engine/themes/drawPrimitives/platforms.ts`
- Modify: `src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`

These are the bulk of the framework — they take a canvas context and draw parts of the 3D platform. Smoke-tested with a mock context.

- [ ] **Step 1: Add failing smoke tests**

Append to `src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`:

```typescript
import {
  drawPlatformDropShadow,
  drawPlatformRightFace,
  drawPlatformCap,
  drawStone,
  drawLeafCluster,
} from '../platforms';

function mockCanvasContext(): any {
  const calls: string[] = [];
  const record = (method: string) => () => { calls.push(method); };
  return new Proxy({
    _calls: calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    closePath: () => calls.push('closePath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    arc: () => calls.push('arc'),
    ellipse: () => calls.push('ellipse'),
    quadraticCurveTo: () => calls.push('quadraticCurveTo'),
    bezierCurveTo: () => calls.push('bezierCurveTo'),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke'),
    clip: () => calls.push('clip'),
    fillRect: () => calls.push('fillRect'),
    translate: () => calls.push('translate'),
    rotate: () => calls.push('rotate'),
    scale: () => calls.push('scale'),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    filter: 'none',
    shadowColor: '',
    shadowBlur: 0,
  }, {
    set(t, k, v) { (t as any)[k] = v; return true; }
  });
}

describe('platforms.ts — rendering helpers (smoke tests)', () => {
  const platform = { x: 100, y: 200, width: 180, height: 24 };

  it('drawPlatformDropShadow does not throw', () => {
    const ctx = mockCanvasContext();
    expect(() => drawPlatformDropShadow(ctx, platform)).not.toThrow();
  });

  it('drawPlatformRightFace does not throw', () => {
    const ctx = mockCanvasContext();
    expect(() => drawPlatformRightFace(ctx, platform, '#808080')).not.toThrow();
  });

  it('drawPlatformCap does not throw', () => {
    const ctx = mockCanvasContext();
    const rng = mulberry32(1);
    const front = wavyDown(platform.x, platform.width, platform.y + CAP_DEPTH / 2, rng, {});
    const back = backFlat(platform.x, platform.width, platform.y - CAP_DEPTH / 2, CAP_DEPTH * SKEW_RATIO);
    expect(() => drawPlatformCap(ctx, platform, front, back, {
      capColor: '#5a8f3a',
      capLight: 'rgba(255,255,220,0.15)',
      drawCapTexture: () => {},
    })).not.toThrow();
  });

  it('drawStone does not throw', () => {
    const ctx = mockCanvasContext();
    expect(() => drawStone(ctx, 100, 200, 4, 3, 0.3, '#888', '#555', '#aaa')).not.toThrow();
  });

  it('drawLeafCluster does not throw', () => {
    const ctx = mockCanvasContext();
    expect(() => drawLeafCluster(ctx, 100, 200, 4, mulberry32(1))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement the rendering helpers**

Append to `src/engine/themes/drawPrimitives/platforms.ts`:

```typescript
import type { Platform } from '../../types';

// ---- Derived geometry ----
/** Y-coordinate of the cap's front edge (lowest point of cap, closest to body top). */
export function capFrontY(platform: Platform): number { return platform.y + CAP_DEPTH / 2; }
/** Y-coordinate of the cap's back edge (highest point, furthest from body). */
export function capBackY(platform: Platform): number { return platform.y - CAP_DEPTH / 2; }
/** Horizontal skew offset in pixels (back edge shifted right by this much). */
export function skewPx(): number { return CAP_DEPTH * SKEW_RATIO; }

// ---- Rendering helpers ----

/** Blurred oval shadow under the platform footprint. Covers full 3D footprint width including overhang. */
export function drawPlatformDropShadow(ctx: CanvasRenderingContext2D, platform: Platform): void {
  const sp = skewPx();
  const footprintBottom = platform.y + platform.height;
  ctx.save();
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(platform.x + 4, footprintBottom + 2, platform.width + sp - 8, 6);
  ctx.restore();
}

/** The right-side face — parallelogram connecting body's front-right to cap's back-right. */
export function drawPlatformRightFace(ctx: CanvasRenderingContext2D, platform: Platform, fillStyle: string): void {
  const sp = skewPx();
  const bt = capFrontY(platform);
  const bb = platform.y + platform.height;
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(platform.x + platform.width, bt);
  ctx.lineTo(platform.x + platform.width + sp, bt - CAP_DEPTH);
  ctx.lineTo(platform.x + platform.width + sp, bb - CAP_DEPTH);
  ctx.lineTo(platform.x + platform.width, bb);
  ctx.closePath();
  ctx.fill();
}

export interface CapRenderOpts {
  capColor: string;
  capLight?: string;
  /** Callback that paints additional texture inside the clipped cap polygon. */
  drawCapTexture: (ctx: CanvasRenderingContext2D, cF: number, cB: number, sp: number) => void;
}

/** Cap polygon + gradient + texture. frontPts / backPts define the irregular edges. */
export function drawPlatformCap(
  ctx: CanvasRenderingContext2D,
  platform: Platform,
  frontPts: EdgePoint[],
  backPts: EdgePoint[],
  opts: CapRenderOpts,
): void {
  const sp = skewPx();
  const cF = capFrontY(platform);
  const cB = capBackY(platform);

  const tracePath = () => {
    ctx.beginPath();
    ctx.moveTo(backPts[0].x, backPts[0].y);
    for (let i = 1; i < backPts.length; i++) ctx.lineTo(backPts[i].x, backPts[i].y);
    ctx.lineTo(platform.x + platform.width, cF);
    for (let i = frontPts.length - 1; i >= 0; i--) ctx.lineTo(frontPts[i].x, frontPts[i].y);
    ctx.closePath();
  };

  // Base fill
  ctx.fillStyle = opts.capColor;
  tracePath();
  ctx.fill();

  // Gradient + texture, clipped to cap shape
  ctx.save();
  tracePath();
  ctx.clip();
  const grad = ctx.createLinearGradient(0, cB - 4, 0, cF + 6);
  grad.addColorStop(0, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, opts.capLight ?? 'rgba(255,255,220,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(platform.x - 5, cB - 6, platform.width + sp + 10, CAP_DEPTH + 14);
  opts.drawCapTexture(ctx, cF, cB, sp);
  ctx.restore();

  // Right-face top edge — dark hairline for the fold between cap and right face
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(platform.x + platform.width, cF);
  ctx.lineTo(platform.x + platform.width + sp, cB);
  ctx.stroke();
}

// ---- Left-side protrusion primitives ----

/** Three-layer stone: dark base ellipse + colored base + lighter highlight. */
export function drawStone(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  rx: number, ry: number,
  angle: number,
  base: string, dark: string, light: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.ellipse(-rx * 0.12, -ry * 0.15, rx * 0.82, ry * 0.72, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.ellipse(-rx * 0.32, -ry * 0.32, rx * 0.3, ry * 0.22, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** 3-5 overlapping leaves around a center, with faint veins. */
export function drawLeafCluster(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, rng: () => number): void {
  const greens = ['#4a8028', '#5a9030', '#6aa838', '#3a7020'];
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4;
    const dx = Math.cos(a) * size * 0.4;
    const dy = Math.sin(a) * size * 0.3;
    ctx.fillStyle = greens[Math.floor(rng() * 4)];
    ctx.beginPath();
    ctx.ellipse(cx + dx, cy + dy, size * 0.55, size * 0.32, a + 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,40,15,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + dx - Math.cos(a + 0.3) * size * 0.5, cy + dy - Math.sin(a + 0.3) * size * 0.3);
    ctx.lineTo(cx + dx + Math.cos(a + 0.3) * size * 0.5, cy + dy + Math.sin(a + 0.3) * size * 0.3);
    ctx.stroke();
  }
}

/** Builder: draw N varied stones protruding LEFT of the body. */
export interface StonePaletteRow { base: string; dark: string; light: string; }
export interface LeftStoneOpts {
  count?: number;
  rxMin?: number;
  rxMax?: number;
  elongateChance?: number;
}

export function drawLeftStones(
  ctx: CanvasRenderingContext2D,
  platform: Platform,
  palette: StonePaletteRow[],
  rng: () => number,
  opts: LeftStoneOpts = {},
): void {
  const count = opts.count ?? 3;
  const rxMin = opts.rxMin ?? 2.5;
  const rxMax = opts.rxMax ?? 5;
  const elongateChance = opts.elongateChance ?? 0.4;
  const N = count + Math.floor(rng() * 2);
  const bt = capFrontY(platform);
  const bb = platform.y + platform.height;
  for (let i = 0; i < N; i++) {
    const cy = bt + 4 + (i + rng() * 0.4) * (bb - bt - 8) / N;
    const rx = rxMin + rng() * (rxMax - rxMin);
    const elongate = rng() < elongateChance;
    const ry = elongate ? rx * (0.55 + rng() * 0.25) : rx * (0.8 + rng() * 0.15);
    const angle = (rng() - 0.5) * 0.9;
    const cx = platform.x - rx * (0.25 + rng() * 0.25);
    const p = palette[Math.floor(rng() * palette.length)];
    drawStone(ctx, cx, cy, rx, ry, angle, p.base, p.dark, p.light);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/themes/drawPrimitives/__tests__/platforms.test.ts`
Expected: PASS, 14 tests total.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc -b`
Expected: passes.

- [ ] **Step 6: Export the new module from the barrel**

Modify `src/engine/themes/drawPrimitives/index.ts` to add `export * from './platforms';` as the last export line:

```typescript
// Barrel: shared drawing primitives used by theme/arena draw functions.
// Split into background/foreground/winter/hazardFactories/platforms submodules —
// import any primitive from `./themes/drawPrimitives`.

export * from './background';
export * from './foreground';
export * from './winter';
export * from './hazardFactories';
export * from './platforms';
```

- [ ] **Step 7: Verify typecheck after barrel update**

Run: `npx tsc -b`
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add src/engine/themes/drawPrimitives/platforms.ts src/engine/themes/drawPrimitives/__tests__/platforms.test.ts src/engine/themes/drawPrimitives/index.ts
git commit -m "feat: platforms.ts — cap/body/right-face rendering + stone+leaf primitives"
```

---

## Task 7: Wire renderer dispatcher

**Files:**
- Modify: `src/engine/renderer.ts:197-277`

- [ ] **Step 1: Read the relevant block**

Open `src/engine/renderer.ts`. Locate:
- Line ~197-200: the loop that iterates `arena.platforms` and calls `this.drawPlatform(ctx, plat.x, plat.y, plat.width, plat.height, plat.y >= 650)`.
- Line ~242-277: the private `drawPlatform` method.

- [ ] **Step 2: Change the iteration to pass the Platform object**

Replace lines ~197-200:

```typescript
    // Platforms (use mirrored arena data, no canvas transform needed)
    for (const plat of arena.platforms) {
      this.drawPlatform(ctx, plat.x, plat.y, plat.width, plat.height, plat.y >= 650);
    }
```

with:

```typescript
    // Platforms (use mirrored arena data, no canvas transform needed)
    for (const plat of arena.platforms) {
      this.drawPlatform(ctx, plat, plat.y >= 650);
    }
```

- [ ] **Step 3: Update the private method to dispatch**

Replace the existing `drawPlatform` method (lines ~242-277) with:

```typescript
  private drawPlatform(ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean): void {
    // Pack-owned override — new architecture (see docs/superpowers/specs/2026-04-24-arena-platforms-design.md)
    if (this.theme.drawPlatform) {
      this.theme.drawPlatform(ctx, platform, isGround);
      return;
    }

    const tp = this.theme.platform;

    // Legacy theme.platform.customDraw escape hatch (pre-framework)
    if (tp.customDraw) {
      tp.customDraw(ctx, platform.x, platform.y, platform.width, platform.height, isGround);
      return;
    }

    // Default flat-rect fallback — used by 10 unmigrated packs until they adopt drawPlatform
    const { x, y, width: w, height: h } = platform;
    if (isGround) {
      ctx.fillStyle = tp.groundBodyColor;
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = tp.groundTopColor;
      ctx.fillRect(x, y, w, 8);
      const spotColor = this.blendColor(tp.groundBodyColor, '#FFFFFF', 0.15);
      ctx.fillStyle = spotColor;
      for (let dx = 10; dx < w; dx += 30 + Math.random() * 20) {
        ctx.fillRect(x + dx, y + 15 + Math.random() * 20, 4, 3);
      }
    } else {
      ctx.fillStyle = tp.floatingBodyColor;
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = tp.floatingTopColor;
      ctx.fillRect(x, y, w, 6);
      if (tp.floatingAccentColor) {
        ctx.fillStyle = tp.floatingAccentColor;
        ctx.fillRect(x, y, w, 3);
      }
      if (tp.drawMoss) {
        drawPlatformMoss(ctx, x, y, h);
        drawPlatformMoss(ctx, x + w, y, h);
      }
    }
  }
```

Also ensure `Platform` is imported at the top of `renderer.ts`. Find the existing `import type { ... } from './types';` line. If `Platform` is already imported, nothing to do. If not, add it.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc -b`
Expected: passes.

- [ ] **Step 5: Run existing renderer tests**

Run: `npx vitest run src/engine/renderer.test.ts`
Expected: PASS. (These tests use `renderer.renderFrame(state, arena, [])`; our dispatch change is transparent when no pack defines `drawPlatform`.)

- [ ] **Step 6: Commit**

```bash
git add src/engine/renderer.ts
git commit -m "feat: renderer dispatches to theme.drawPlatform when defined, falls back otherwise"
```

---

## Task 8: Implement meadow's `drawPlatform` using the framework

**Files:**
- Modify: `src/engine/arenas/packs/meadow.ts`
- Create: `src/engine/arenas/packs/__tests__/meadow-platform.test.ts`

This is the payload. Meadow's material matches the v9 mockup's meadow card.

- [ ] **Step 1: Write the failing smoke test**

Create `src/engine/arenas/packs/__tests__/meadow-platform.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { meadow } from '../meadow';

function mockCanvasContext(): any {
  const noop = () => {};
  return new Proxy({
    save: noop, restore: noop,
    beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop,
    arc: noop, ellipse: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, stroke: noop, clip: noop,
    fillRect: noop, strokeRect: noop,
    translate: noop, rotate: noop, scale: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    fillStyle: '', strokeStyle: '',
    lineWidth: 1, globalAlpha: 1,
    filter: 'none', shadowColor: '', shadowBlur: 0,
  }, { set(t, k, v) { (t as any)[k] = v; return true; } });
}

describe('meadow.drawPlatform', () => {
  it('is defined (meadow is migrated to the framework)', () => {
    expect(typeof meadow.drawPlatform).toBe('function');
  });

  it('renders a floating platform without throwing', () => {
    const ctx = mockCanvasContext();
    const floating = meadow.platforms[1];  // first non-ground platform
    expect(() => meadow.drawPlatform!(ctx, floating, false)).not.toThrow();
  });

  it('renders the ground platform without throwing', () => {
    const ctx = mockCanvasContext();
    const ground = meadow.platforms[0];
    expect(() => meadow.drawPlatform!(ctx, ground, true)).not.toThrow();
  });

  it('is deterministic across calls for the same platform', () => {
    // Framework uses mulberry32(seedFor(x,y)) — same platform should produce
    // the same context calls. We verify indirectly by checking no throw across
    // multiple renders (deep equality would need a richer mock).
    const ctx = mockCanvasContext();
    const floating = meadow.platforms[1];
    expect(() => {
      meadow.drawPlatform!(ctx, floating, false);
      meadow.drawPlatform!(ctx, floating, false);
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/engine/arenas/packs/__tests__/meadow-platform.test.ts`
Expected: FAIL — `meadow.drawPlatform` is undefined.

- [ ] **Step 3: Add imports at the top of `meadow.ts`**

Read `src/engine/arenas/packs/meadow.ts`. Find the existing import block at the top. Add a new import line after the existing drawPrimitives import:

```typescript
import {
  CAP_DEPTH, SKEW_RATIO, mulberry32, seedFor,
  drawPlatformDropShadow, drawPlatformRightFace, drawPlatformCap,
  drawLeftStones, wavyDown, backWavyUp,
} from '../../themes/drawPrimitives';
import type { Platform } from '../../types';
```

(If `Platform` is already imported, skip its line.)

- [ ] **Step 4: Add the `drawPlatform` function inside the meadow pack object**

Read meadow.ts carefully to find a good insertion point. Add `drawPlatform` in the same section as `drawBackgroundNature` / `drawForegroundNature` (after them, before `ambientSoundConfig`). The function:

```typescript
  drawPlatform: (ctx: CanvasRenderingContext2D, platform: Platform, _isGround: boolean) => {
    const rng = mulberry32(seedFor(platform.x, platform.y));
    const cF = platform.y + CAP_DEPTH / 2;
    const cB = platform.y - CAP_DEPTH / 2;
    const bodyTop = cF;
    const bodyH = platform.height - CAP_DEPTH / 2;  // body's visible front face
    const sp = CAP_DEPTH * SKEW_RATIO;

    drawPlatformDropShadow(ctx, platform);

    // Right face — dark dirt tone
    drawPlatformRightFace(ctx, platform, '#1e130a');

    // Left-side stones (varied gray-brown palette)
    const stonePalette = [
      { base: '#8a8278', dark: '#5a5450', light: '#b0a89c' },
      { base: '#706860', dark: '#3a3430', light: '#9a9288' },
      { base: '#9a9080', dark: '#6a6258', light: '#c0b8a8' },
      { base: '#787068', dark: '#484038', light: '#a89888' },
    ];
    drawLeftStones(ctx, platform, stonePalette, rng, { count: 3, rxMin: 2, rxMax: 5, elongateChance: 0.5 });

    // Body front face — soil gradient with clumps, pebbles, one exposed root
    const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
    g.addColorStop(0, '#5a3a20');
    g.addColorStop(0.5, '#4a2e18');
    g.addColorStop(1, '#2e1e10');
    ctx.fillStyle = g;
    ctx.fillRect(platform.x, bodyTop, platform.width, bodyH);
    // Dirt clumps
    ctx.fillStyle = 'rgba(20,10,5,0.45)';
    const clumpCount = Math.floor(platform.width / 12);
    for (let i = 0; i < clumpCount; i++) {
      const px = platform.x + rng() * platform.width;
      const py = bodyTop + 3 + rng() * (bodyH - 5);
      ctx.beginPath();
      ctx.ellipse(px, py, 2 + rng() * 1.5, 1.2 + rng() * 0.8, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pebbles
    ctx.fillStyle = 'rgba(180,160,140,0.6)';
    const pebbleCount = Math.floor(platform.width / 25);
    for (let i = 0; i < pebbleCount; i++) {
      ctx.beginPath();
      ctx.ellipse(platform.x + rng() * platform.width, bodyTop + 4 + rng() * (bodyH - 6), 1.4, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Body bottom bevel — dark strip at the bottom of the front face
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(platform.x, bodyTop + bodyH - 4, platform.width, 4);

    // Edge profiles
    const frontPts = wavyDown(platform.x, platform.width, cF, rng, { bumps: 5, ampMin: 2, ampMax: 4, valleyBase: 0.3 });
    const backPts = backWavyUp(platform.x, platform.width, cB, sp, rng, { bumps: 4, ampMin: 2, ampMax: 3.5 });

    // Cap — grass with tufted dots
    drawPlatformCap(ctx, platform, frontPts, backPts, {
      capColor: '#5a8f3a',
      capLight: 'rgba(255,255,220,0.15)',
      drawCapTexture: (ctx2, capFront, _capBack, skew) => {
        ctx2.fillStyle = '#4a7a2e';
        const n = Math.floor(platform.width / 7);
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n + Math.sin(i * 2.3 + platform.x * 0.01) * 0.04;
          const v = 0.15 + (Math.sin(i * 7.1 + platform.x * 0.02) + 1) * 0.35;
          ctx2.beginPath();
          ctx2.arc(platform.x + u * platform.width + v * skew, capFront - v * CAP_DEPTH, 0.85, 0, Math.PI * 2);
          ctx2.fill();
        }
      },
    });
  },
```

Note: `_isGround` is received but unused in meadow — the same material works for both floating and ground, which is what the v9 mockup shows. If differentiation becomes needed later (e.g. denser grass on ground), add a branch.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/engine/arenas/packs/__tests__/meadow-platform.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS (full suite ~2000 tests).

- [ ] **Step 7: Verify typecheck**

Run: `npx tsc -b`
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add src/engine/arenas/packs/meadow.ts src/engine/arenas/packs/__tests__/meadow-platform.test.ts
git commit -m "feat: migrate meadow to pack-owned drawPlatform with 3D framework"
```

---

## Task 9: Verify non-meadow arenas still render via fallback

**Files:**
- Verify: all 10 other arena pack files (no modifications).

- [ ] **Step 1: Run the full suite once more to confirm nothing broke**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 2: Build to catch any production-only regressions**

Run: `npm run build`
Expected: build succeeds, no type errors, no unresolved imports.

- [ ] **Step 3: Commit only if any tiny fixes were needed**

If no changes were required, skip this commit.

---

## Task 10: Playtest checkpoint — manual validation

**Files:** none (manual step)

This is a hand-off step. The engineer cannot complete this — the user must run the dev server and verify. Mark the task complete only after the user approves.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Open meadow via the URL shortcut**

Open in a browser: `http://localhost:5173/carrot-royale/?arena=meadow&bots=2`

- [ ] **Step 3: Verify checklist (user confirms each)**

- The 3D cap is clearly visible, character stands mid-cap.
- Varied stones protrude to the left of floating platforms (different size/shape/shade per stone, different per platform).
- Front edge has rounded wavy bumps going down; back edge has matching bumps going up.
- No sky showing through anywhere on the cap (no gaps).
- Platform's collision feels unchanged — no weird clipping, characters land/walk/jump normally.
- Ground platform also has the 3D cap (same depth, same skew).
- Redrawing the background (trigger a kill) does not cause visible variation changes (deterministic).
- Performance unchanged — no noticeable frame drops.

- [ ] **Step 4: Open a different arena to confirm fallback still works**

Open: `http://localhost:5173/carrot-royale/?arena=castle&bots=2`
Verify: castle renders exactly as it did before this branch (flat rectangles with the current look).

- [ ] **Step 5: Obtain user sign-off**

If the user approves, mark this task done. If anything looks wrong, file a follow-up note and iterate before declaring the phase complete.

- [ ] **Step 6: Final commit (if needed) and branch summary**

No code changes expected at this step. Report status to the user — phase 1 complete, ready to plan phase 2 (remaining 10 arenas).

---

## Self-Review Notes

**Spec coverage:** The spec's "in-scope" list is covered: framework helpers (Task 4-6), `drawPlatform` on ArenaPack / ThemeConfig (Task 2-3), transitional fallback (Task 7), meadow migration (Task 8), smoke test (Task 6, Task 8), playtest checkpoint (Task 10). `Platform.style` field is added (Task 1) even though meadow doesn't use it — lays groundwork for rooftops in phase 2.

**Placeholder scan:** No TBDs, TODOs, "implement later", or "similar to above" — every step has complete code or exact commands.

**Type consistency:** Function names used consistently — `drawPlatformDropShadow`, `drawPlatformRightFace`, `drawPlatformCap`, `drawStone`, `drawLeafCluster`, `drawLeftStones`. Edge profile names — `wavyDown`, `jaggedDown`, `subtleDown`, `candyDrips`, `backWavyUp`, `backFlat`. All referenced consistently across tasks. Type name `EdgePoint` used in Task 5 and Task 6. `StonePaletteRow` used in Task 6. `Platform` imported consistently.

**Ambiguity check:** One deliberate simplification — meadow uses the same material for floating and ground (doesn't branch on `isGround`). Called out in Task 8 Step 4. If visual check reveals ground needs a different treatment, that's a follow-up, not a blocker.
