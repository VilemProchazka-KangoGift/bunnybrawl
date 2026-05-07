import { describe, it, expect } from 'vitest';
import { buildSunLight } from '../sun';
import type { ThemeConfig } from '../../themes/types';

function mockTheme(dayNightEnabled = true): ThemeConfig {
  return { dayNight: { enabled: dayNightEnabled, showStars: true, showFireflies: true } } as unknown as ThemeConfig;
}

describe('buildSunLight', () => {
  const theme = mockTheme();

  it('returns null at midnight (dayPhase 0.5)', () => {
    expect(buildSunLight(theme, 0.5, false)).toBeNull();
  });

  it('returns null when dayNight.enabled === false', () => {
    expect(buildSunLight(mockTheme(false), 0, false)).toBeNull();
  });

  it('returns a contribution at noon (dayPhase 0)', () => {
    const c = buildSunLight(theme, 0, false);
    expect(c).not.toBeNull();
    expect(c!.intensity).toBeGreaterThan(0.7);
  });

  it('intensity peaks at noon (dayPhase 0)', () => {
    const noon = buildSunLight(theme, 0, false);
    const morning = buildSunLight(theme, 0.85, false); // ~3 hours before noon
    const evening = buildSunLight(theme, 0.15, false); // ~3 hours after noon
    expect(noon).not.toBeNull();
    if (morning) expect(noon!.intensity).toBeGreaterThan(morning.intensity);
    if (evening) expect(noon!.intensity).toBeGreaterThan(evening.intensity);
  });

  it('color is warmer near horizon than at noon', () => {
    const noon = buildSunLight(theme, 0, false)!;
    const horizon = buildSunLight(theme, 0.20, false); // ~near sunset
    if (horizon) {
      expect(horizon.color.b).toBeLessThan(noon.color.b);
    }
  });

  it('returns null in the night band (0.25 < dayPhase < 0.75)', () => {
    expect(buildSunLight(theme, 0.30, false)).toBeNull();
    expect(buildSunLight(theme, 0.50, false)).toBeNull();
    expect(buildSunLight(theme, 0.70, false)).toBeNull();
  });

  it('photosensitivity caps intensity at 70% absolute (not 70% scale)', () => {
    // At noon, intensity is ~1.0 → cap to 0.7. The buggy `min(x, 0.7x)` impl
    // returned 0.7 here too (0.7 * 1.0 = 0.7), which is why the bug evaded
    // the original test. Catch it at off-peak where the impls diverge:
    //   buggy:  min(0.5, 0.7 * 0.5) = 0.35
    //   correct: min(0.5, 0.7)      = 0.5  (sub-cap, no clamp)
    const noonOn = buildSunLight(theme, 0, true)!;
    expect(noonOn.intensity).toBeCloseTo(0.7, 5);

    // At dayPhase 0.125 the natural intensity is cos(π/4) ≈ 0.707; cap is
    // 0.7, so the cap should bind very narrowly. At dayPhase 0.18 natural
    // intensity ≈ 0.31, well below cap → photosensitivity should NOT change it.
    const offMid = buildSunLight(theme, 0.18, false)!;
    const onMid = buildSunLight(theme, 0.18, true)!;
    expect(onMid.intensity).toBeCloseTo(offMid.intensity, 5);
  });

  it('handles dayPhase outside [0,1) by wrapping', () => {
    expect(buildSunLight(theme, 1.05, false)).not.toBeNull(); // wraps to 0.05 (early afternoon)
    expect(buildSunLight(theme, -0.1, false)).not.toBeNull(); // wraps to 0.9 (mid-morning)
  });
});
