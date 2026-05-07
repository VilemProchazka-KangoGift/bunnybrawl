// src/engine/lighting/__tests__/pipeline.smoke.test.ts
import { describe, it, expect } from 'vitest';
import { LightingPipeline } from '../pipeline';

describe('LightingPipeline (Part A no-op stub)', () => {
  it('constructs with width and height', () => {
    const p = new LightingPipeline(1280, 720);
    expect(p).toBeDefined();
  });

  it('isEnabled() returns true by default (kill switch off)', () => {
    const p = new LightingPipeline(1280, 720);
    expect(p.isEnabled()).toBe(true);
  });

  it('beginFrame and composite are no-ops in Part A', () => {
    const p = new LightingPipeline(1280, 720);
    expect(() => p.beginFrame()).not.toThrow();
    // Mock a canvas context for the no-op composite call
    const mockCtx = {} as CanvasRenderingContext2D;
    expect(() => p.composite(mockCtx)).not.toThrow();
  });

  it('resize updates internal dims without throwing', () => {
    const p = new LightingPipeline(1280, 720);
    expect(() => p.resize(640, 360, 0.5)).not.toThrow();
  });
});
