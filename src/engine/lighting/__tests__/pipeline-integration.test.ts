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

describe('LightingPipeline integration', () => {
  it('full frame: scene + ambient + sun composite produces visible mid-tones at noon', () => {
    if (typeof OffscreenCanvas === 'undefined') return; // skip in env without OffscreenCanvas
    const scene = new OffscreenCanvas(1280, 720);
    const sctx = scene.getContext('2d')!;
    sctx.fillStyle = '#7E9F4D'; // grass-ish mid-tone
    sctx.fillRect(0, 660, 1280, 60);
    sctx.fillStyle = '#A0C4E8'; // sky
    sctx.fillRect(0, 0, 1280, 660);

    const p = new LightingPipeline(1280, 720);
    p.beginFrame(theme, 0, 0); // noon (game convention)
    p.composite(sctx as unknown as CanvasRenderingContext2D);

    // Ground pixel: should still be a recognizable green (not mud)
    const ground = sctx.getImageData(640, 700, 1, 1).data;
    expect(ground[1]).toBeGreaterThan(120); // green channel survives
    expect(ground[0] + ground[1] + ground[2]).toBeGreaterThan(200); // not mud
  });

  it('full frame: midnight composite darkens the world but never to pure black', () => {
    if (typeof OffscreenCanvas === 'undefined') return;
    const scene = new OffscreenCanvas(1280, 720);
    const sctx = scene.getContext('2d')!;
    sctx.fillStyle = '#FFFFFF';
    sctx.fillRect(0, 0, 1280, 720);

    const p = new LightingPipeline(1280, 720);
    p.beginFrame(theme, 0.5, 0); // midnight (game convention)
    p.composite(sctx as unknown as CanvasRenderingContext2D);

    const pixel = sctx.getImageData(640, 360, 1, 1).data;
    expect(pixel[0]).toBeLessThan(120); // darkened
    expect(pixel[0] + pixel[1] + pixel[2]).toBeGreaterThan(60); // never pure black
  });
});
