import { describe, it, expect } from 'vitest';
import { LightingPipeline } from '../pipeline';

describe('LightingPipeline.getFgTintOpacity (dusk-aware ramp)', () => {
  const p = new LightingPipeline(1280, 720);
  // Pin the threshold by reading the curve shape rather than a magic constant.

  it('returns 0 below the dusk threshold', () => {
    expect(p.getFgTintOpacity(0)).toBe(0);
    expect(p.getFgTintOpacity(0.4)).toBe(0);
    expect(p.getFgTintOpacity(0.55)).toBe(0);
  });

  it('reaches the peak multiplier at full midnight (bgOpacity = 1)', () => {
    // Peak comes from the pipeline's internal constant — read by reaching
    // the right end of the ramp.
    const peak = p.getFgTintOpacity(1);
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('ramps monotonically between threshold and midnight', () => {
    const a = p.getFgTintOpacity(0.7);
    const b = p.getFgTintOpacity(0.85);
    const c = p.getFgTintOpacity(1.0);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('clamps to peak when bgOpacity exceeds 1', () => {
    expect(p.getFgTintOpacity(1.5)).toBe(p.getFgTintOpacity(1));
  });

  it('preserves dusk redshift: at typical sunset bgOpacity (~0.5), tint is 0', () => {
    // Sunset: dayPhase 0.25 → nightIntensity 0.5 → bgOpacity ~0.5–0.6 (with
    // the current MAX_TINT_ALPHA / TINT_GAIN math). Verify the ramp keeps
    // the multiply layer mostly silent so the warm afterglow survives.
    expect(p.getFgTintOpacity(0.5)).toBe(0);
    expect(p.getFgTintOpacity(0.6)).toBeLessThan(0.1);
  });
});
