// src/engine/lighting/__tests__/pipeline-integration.test.ts
//
// End-to-end: builds a real LightingPipeline, drives it through one frame
// against a synthesized minimal scene, asserts the composite output isn't mud.

import { describe, it, expect } from 'vitest';
import { LightingPipeline } from '../pipeline';
import type { ThemeConfig } from '../../themes/types';

const theme = {
  dayNight: { enabled: true, showStars: true, showFireflies: true },
} as unknown as ThemeConfig;

describe('LightingPipeline integration (source-over tint)', () => {
  it('full frame at noon: tint barely visible — scene unchanged', () => {
    if (typeof OffscreenCanvas === 'undefined') return; // skip in JSDOM
    const scene = new OffscreenCanvas(1280, 720);
    const sctx = scene.getContext('2d')!;
    sctx.fillStyle = '#7E9F4D'; // grass-ish mid-tone (126, 159, 77)
    sctx.fillRect(0, 660, 1280, 60);
    sctx.fillStyle = '#A0C4E8'; // sky
    sctx.fillRect(0, 0, 1280, 660);

    const p = new LightingPipeline(1280, 720);
    p.beginFrame(theme, 0); // noon
    p.composite(sctx as unknown as CanvasRenderingContext2D);

    // Ground pixel ~ source-over with rgba(20,24,48, ~0.04) on (126,159,77):
    //   ~0.04 * 159 + 0.96 * 159 ≈ 153 — still recognizable green.
    const ground = sctx.getImageData(640, 700, 1, 1).data;
    expect(ground[1]).toBeGreaterThan(140); // green channel basically intact
  });

  it('full frame at midnight: tint visible — white visibly darkens but stays >0', () => {
    if (typeof OffscreenCanvas === 'undefined') return;
    const scene = new OffscreenCanvas(1280, 720);
    const sctx = scene.getContext('2d')!;
    sctx.fillStyle = '#FFFFFF';
    sctx.fillRect(0, 0, 1280, 720);

    const p = new LightingPipeline(1280, 720);
    p.beginFrame(theme, 0.5); // midnight
    p.composite(sctx as unknown as CanvasRenderingContext2D);

    // White tinted at alpha ~0.48 with rgba(20,24,48):
    //   0.48 * 20 + 0.52 * 255 = ~142 (R channel)
    // So white is visibly darkened but still bright-ish. The point is: NOT 255.
    const pixel = sctx.getImageData(640, 360, 1, 1).data;
    expect(pixel[0]).toBeLessThan(255); // visibly tinted darker
    expect(pixel[0] + pixel[1] + pixel[2]).toBeGreaterThan(200); // stylized, not black
  });
});
