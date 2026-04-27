// Shared canvas-2d mock for tests. happy-dom's `canvas.getContext('2d')`
// returns null, so anything that constructs a Renderer / GameLoop fails on
// `setTransform` etc. unless the prototype is patched. Use `installMockCanvas2D()`
// to install + teardown across a test file.

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

/**
 * Patch `HTMLCanvasElement.prototype.getContext` to return a shared mock 2D
 * context. Idempotent if called twice (only patches once). Returns a `restore`
 * fn that puts the original implementation back — call from `afterAll` if a
 * test file needs to leave the global pristine.
 */
export function installMockCanvas2D(): { ctx: CanvasRenderingContext2D; restore: () => void } {
  const ctx = createMockCanvasCtx();
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type === '2d') return ctx;
    return orig.call(this, type as never);
  } as typeof HTMLCanvasElement.prototype.getContext;
  return {
    ctx,
    restore: () => { HTMLCanvasElement.prototype.getContext = orig; },
  };
}
