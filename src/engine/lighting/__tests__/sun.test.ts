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

  it('photosensitivity caps intensity at 70%', () => {
    const off = buildSunLight(theme, 0, false)!;
    const on = buildSunLight(theme, 0, true)!;
    expect(on.intensity).toBeLessThanOrEqual(off.intensity * 0.7 + 1e-6);
  });
});
