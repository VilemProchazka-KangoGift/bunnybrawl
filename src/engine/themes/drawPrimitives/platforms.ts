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

/**
 * Mirror of wavyDown for back edges. Points go up from cB into sky.
 *
 * Default bumps/resolution are lower than wavyDown's: back edges sit
 * further from the viewer in 3D perspective, so sparser detail reads
 * as more visually cohesive.
 */
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
