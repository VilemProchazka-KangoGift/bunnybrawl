/**
 * Render-scale system: lifts the canvas backing store above logical 1280×720
 * to combat fullscreen blur on high-DPI displays.
 *
 * - Phones/touch-primary: scale = 1 (small screens hide blur, save GPU/memory).
 * - Desktop: scale = min(devicePixelRatio, 2). 4K monitors render at 2× then
 *   CSS-upscales to 4K — kills most blur at only 4× pixel cost.
 *
 * Logical coordinates remain 1280×720 everywhere; consumers call
 * `applyRenderScaleToCanvas` to wire backing store + transform + CSS dims.
 */
import { isTouchPrimary } from './touchDetect';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { getSlowDevice, subscribeSlowDevice } from './perfFlags';

export const MAX_RENDER_SCALE = 2;

type Listener = (scale: number) => void;
const listeners = new Set<Listener>();

let _scale = computeScale();
let _initialized = false;
let _dprMq: MediaQueryList | null = null;

function computeScale(): number {
  if (typeof window === 'undefined') return 1;
  if (getSlowDevice()) return 1;
  if (isTouchPrimary()) return 1;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, MAX_RENDER_SCALE);
}

function recompute(): void {
  // Re-create the dpr media query listener — `matchMedia('(resolution: Xdppx)')`
  // only fires the transition AWAY from X, so after one change it never re-fires.
  attachDprListener();
  const next = computeScale();
  if (next !== _scale) {
    _scale = next;
    for (const cb of listeners) cb(_scale);
  }
}

function attachDprListener(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  if (_dprMq) {
    _dprMq.removeEventListener?.('change', recompute);
  }
  _dprMq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  _dprMq.addEventListener?.('change', recompute);
}

function ensureInit(): void {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(recompute, 100);
  });
  attachDprListener();
  document.addEventListener('fullscreenchange', recompute);
  document.addEventListener('webkitfullscreenchange', recompute);
  subscribeSlowDevice(recompute);
}

export function getRenderScale(): number {
  ensureInit();
  return _scale;
}

export function subscribeRenderScale(cb: Listener): () => void {
  ensureInit();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Resize a canvas's backing store to logical-dim × scale, pin its CSS display
 * size to logical dims (so layout doesn't change), and apply the matching
 * transform. Setting width/height resets the transform — that's why this is
 * one atomic call instead of two steps.
 */
export function applyRenderScaleToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  scale: number,
): void {
  const pxW = Math.max(1, Math.round(CANVAS_WIDTH * scale));
  const pxH = Math.max(1, Math.round(CANVAS_HEIGHT * scale));
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  // OffscreenCanvas has no .style (no DOM layout). HTMLCanvasElement needs
  // CSS dims pinned to logical so the visual size doesn't change with backing-
  // store growth.
  if ('style' in canvas) {
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
