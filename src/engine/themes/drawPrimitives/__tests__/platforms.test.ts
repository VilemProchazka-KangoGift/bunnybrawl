import { describe, it, expect } from 'vitest';
import {
  backFlat,
  backWavyUp,
  CAP_DEPTH,
  candyDrips,
  drawLeafCluster,
  drawPlatformCap,
  drawPlatformDropShadow,
  drawPlatformRightFace,
  drawStone,
  jaggedDown,
  mulberry32,
  seedFor,
  SKEW_RATIO,
  subtleDown,
  wavyDown,
} from '../platforms';

describe('platforms.ts framework — core helpers', () => {
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

describe('platforms.ts — front-edge profile generators', () => {
  const x = 100, w = 200, cF = 300;

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

  it('backWavyUp starts at (x, cB), ends at (x+w+sp, cB), only bulges up (y <= cB)', () => {
    const pts = backWavyUp(x, w, cB, sp, mulberry32(1), {});
    expect(pts[0]).toEqual({ x, y: cB });
    expect(pts[pts.length - 1]).toEqual({ x: x + w + sp, y: cB });
    for (const p of pts) expect(p.y).toBeLessThanOrEqual(cB);
  });

  it('backFlat returns exactly 2 straight points', () => {
    const pts = backFlat(x, w, cB, sp);
    expect(pts).toEqual([{ x, y: cB }, { x: x + w + sp, y: cB }]);
  });
});

function mockCanvasContext(): any {
  const calls: string[] = [];
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
