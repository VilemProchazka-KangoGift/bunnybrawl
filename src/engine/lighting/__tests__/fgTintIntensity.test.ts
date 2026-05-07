import { describe, it, expect } from 'vitest';
import { fgTintIntensity, FG_TINT_DUSK_THRESHOLD, FG_TINT_PEAK_MUL } from '../pipeline';

describe('fgTintIntensity (dusk-aware ramp)', () => {
  it('returns 0 below the dusk threshold', () => {
    expect(fgTintIntensity(0)).toBe(0);
    expect(fgTintIntensity(FG_TINT_DUSK_THRESHOLD * 0.9)).toBe(0);
    // The threshold itself is exclusive: at exactly threshold, t=0 → 0.
    expect(fgTintIntensity(FG_TINT_DUSK_THRESHOLD)).toBe(0);
  });

  it('reaches FG_TINT_PEAK_MUL at full midnight (bgOpacity = 1)', () => {
    expect(fgTintIntensity(1)).toBeCloseTo(FG_TINT_PEAK_MUL, 5);
  });

  it('ramps linearly between dusk threshold and midnight', () => {
    const mid = (FG_TINT_DUSK_THRESHOLD + 1) / 2;
    const expected = 0.5 * FG_TINT_PEAK_MUL;
    expect(fgTintIntensity(mid)).toBeCloseTo(expected, 5);
  });

  it('clamps to FG_TINT_PEAK_MUL when bgOpacity exceeds 1', () => {
    expect(fgTintIntensity(1.5)).toBeCloseTo(FG_TINT_PEAK_MUL, 5);
  });

  it('preserves dusk redshift: at typical sunset bgOpacity (~0.5), tint is 0', () => {
    // Sunset: dayPhase 0.25 → nightIntensity 0.5 → bgOpacity ~0.6 (with the
    // current MAX_TINT_ALPHA / 0.7 deficit math). Verify the ramp keeps the
    // multiply layer mostly silent so the warm afterglow survives.
    expect(fgTintIntensity(0.5)).toBe(0);
    expect(fgTintIntensity(0.6)).toBeLessThan(0.1);
  });
});
