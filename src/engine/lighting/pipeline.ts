// src/engine/lighting/pipeline.ts
//
// LightingPipeline (Part A — no-op stub).
// Real implementation lands in Part B (PR 2). This stub exists so the renderer
// integration hook can ship to main first, isolating drift surface from the
// FoliageSystem refactor brainstorm.

import { isLightingEnabled } from './index';

export class LightingPipeline {
  width: number;
  height: number;

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
