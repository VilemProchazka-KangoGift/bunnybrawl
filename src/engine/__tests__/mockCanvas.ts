// Shared canvas-2d mock for tests. happy-dom's `canvas.getContext('2d')`
// returns null, so anything that constructs a Renderer / GameLoop fails on
// `setTransform` etc. unless the prototype is patched.

import { vi } from 'vitest';

export function createMockCanvasCtx(): CanvasRenderingContext2D {
  const ctx = {
    fillRect: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    scale: vi.fn(), drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    measureText: vi.fn(() => ({ width: 50, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })),
    fillText: vi.fn(), strokeText: vi.fn(), closePath: vi.fn(),
    setTransform: vi.fn(), resetTransform: vi.fn(), clip: vi.fn(),
    rect: vi.fn(), ellipse: vi.fn(), quadraticCurveTo: vi.fn(), bezierCurveTo: vi.fn(),
    roundRect: vi.fn(), setLineDash: vi.fn(),
    canvas: { width: 1280, height: 720 },
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    lineJoin: 'miter', font: '', textAlign: 'start', textBaseline: 'alphabetic',
    shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    filter: 'none',
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const MOCK_INSTALLED = Symbol.for('mockCanvas2dInstalled');

/**
 * Patch `HTMLCanvasElement.prototype.getContext` to return a shared mock 2D
 * context for the lifetime of the test worker. Vitest isolates test files into
 * separate workers, so this is fire-and-forget — no teardown needed. Call once
 * at the top of any test file that constructs a Renderer / GameLoop.
 *
 * Within a single worker, repeat calls are no-ops (the patch is keyed by a
 * symbol on the prototype), so each migrated test file can call it without
 * coordinating.
 */
export function installMockCanvas2D(): CanvasRenderingContext2D {
  type PatchedProto = typeof HTMLCanvasElement.prototype & {
    [MOCK_INSTALLED]?: { ctx: CanvasRenderingContext2D };
  };
  const proto = HTMLCanvasElement.prototype as PatchedProto;
  const existing = proto[MOCK_INSTALLED];
  if (existing) return existing.ctx;

  const ctx = createMockCanvasCtx();
  const orig = proto.getContext;
  proto.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type === '2d') return ctx;
    return orig.call(this, type as never);
  } as typeof HTMLCanvasElement.prototype.getContext;
  proto[MOCK_INSTALLED] = { ctx };
  return ctx;
}
