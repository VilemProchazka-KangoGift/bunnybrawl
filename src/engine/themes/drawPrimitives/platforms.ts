/**
 * Shared framework for 3D platform rendering.
 *
 * Arena packs compose these helpers in their `drawPlatform` functions.
 * See docs/superpowers/specs/2026-04-24-arena-platforms-design.md for
 * the full design rationale.
 */

import type { Platform } from '../../types';

// ---- Locked parameters ----
/** Vertical extent of the 3D top cap (px). Straddles the collision line. */
export const CAP_DEPTH = 16;
/** Horizontal skew ratio. Back edge is offset right by CAP_DEPTH * SKEW_RATIO. */
export const SKEW_RATIO = 0.5;

// ---- Deterministic PRNG ----
/** mulberry32 — fast 32-bit PRNG for per-platform visual variation. */
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
 * Back-left corner sits at (x, cB) so the cap's left side reads as a
 * vertical edge (aligned with collision left). The back spans the full
 * cap width (w + sp) because the right side remains skewed by sp.
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
  const backWidth = w + sp;
  const pts: EdgePoint[] = [{ x, y: cB }];
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
    pts.push({ x: x + t * backWidth, y: cB + dy });
  }
  pts.push({ x: x + w + sp, y: cB });
  return pts;
}

/** Straight back edge — for man-made materials that keep a clean horizon line. */
export function backFlat(x: number, w: number, cB: number, sp: number): EdgePoint[] {
  return [{ x, y: cB }, { x: x + w + sp, y: cB }];
}

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

/**
 * The right-side face — parallelogram connecting body's front-right to cap's back-right.
 * `bottomY` overrides the body's bottom edge (defaults to platform.y + platform.height);
 * useful for shapes whose visual body extends past their collision rect (e.g. stumps).
 */
export function drawPlatformRightFace(ctx: CanvasRenderingContext2D, platform: Platform, fillStyle: string, bottomY?: number): void {
  const sp = skewPx();
  const bt = capFrontY(platform);
  const bb = bottomY ?? (platform.y + platform.height);
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

/** Palette row used by drawLeftStones to shade three ellipse layers. */
export interface StonePaletteRow { base: string; dark: string; light: string; }

export interface LeftStoneOpts {
  count?: number;
  rxMin?: number;
  rxMax?: number;
  elongateChance?: number;
}

/** Draw a column of varied stones protruding LEFT of the body. */
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
