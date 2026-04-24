import { useEffect, type RefObject } from 'react';
import { applyRenderScaleToCanvas, getRenderScale, subscribeRenderScale } from '../engine/renderScale';

/**
 * Wires a canvas's backing store to the global render scale and re-applies on change.
 * No-op when the ref is null or 2D context is unavailable (e.g. happy-dom tests).
 */
export function useCanvasRenderScale(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const apply = (s: number): void => applyRenderScaleToCanvas(canvas, ctx, s);
    apply(getRenderScale());
    return subscribeRenderScale(apply);
  }, [canvasRef]);
}
