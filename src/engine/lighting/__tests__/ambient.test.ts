import { describe, it, expect } from 'vitest';
import { themeToAmbient } from '../ambient';
import type { ThemeConfig } from '../../themes/types';

function mockTheme(dayNightEnabled: boolean): ThemeConfig {
  return {
    dayNight: { enabled: dayNightEnabled, showStars: true, showFireflies: true },
  } as unknown as ThemeConfig;
}

describe('themeToAmbient', () => {
  const theme = mockTheme(true);

  it('returns warm-bright at noon (dayPhase 0)', () => {
    const c = themeToAmbient(theme, 0, false);
    expect(c.r).toBeGreaterThan(220);
    expect(c.g).toBeGreaterThan(220);
    expect(c.b).toBeGreaterThan(200);
  });

  it('returns cool-blue floor at midnight (dayPhase 0.5)', () => {
    const c = themeToAmbient(theme, 0.5, false);
    expect(c.r).toBeLessThan(100);
    expect(c.g).toBeLessThan(100);
    expect(c.b).toBeGreaterThan(c.r);
    expect(c.b).toBeGreaterThan(c.g);
  });

  it('dayPhase 0.25 (sunset) is between noon and midnight', () => {
    const noon = themeToAmbient(theme, 0, false);
    const sunset = themeToAmbient(theme, 0.25, false);
    const midnight = themeToAmbient(theme, 0.5, false);
    // r: noon=245 → midnight=60. sunset should be between.
    expect(sunset.r).toBeLessThan(noon.r);
    expect(sunset.r).toBeGreaterThan(midnight.r);
  });

  it('never returns pure black (rgb 0,0,0 forbidden)', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const c = themeToAmbient(theme, p, false);
      expect(c.r + c.g + c.b).toBeGreaterThan(0);
    }
  });

  it('all channels stay in [0, 255]', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const c = themeToAmbient(theme, p, false);
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(255);
      expect(c.g).toBeGreaterThanOrEqual(0);
      expect(c.g).toBeLessThanOrEqual(255);
      expect(c.b).toBeGreaterThanOrEqual(0);
      expect(c.b).toBeLessThanOrEqual(255);
    }
  });

  it('photosensitivity floor: midnight is brighter than rgb(120,130,160) when on', () => {
    const off = themeToAmbient(theme, 0.5, false);
    const on = themeToAmbient(theme, 0.5, true);
    expect(on.r).toBeGreaterThanOrEqual(120);
    expect(on.g).toBeGreaterThanOrEqual(130);
    expect(on.b).toBeGreaterThanOrEqual(160);
    expect(on.r).toBeGreaterThan(off.r);
  });

  it('dayNight.enabled === false returns fixed mid-bright value with no phase animation', () => {
    const fixedTheme = mockTheme(false);
    const c1 = themeToAmbient(fixedTheme, 0.0, false);
    const c2 = themeToAmbient(fixedTheme, 0.5, false);
    expect(c1.r).toBe(c2.r);
    expect(c1.g).toBe(c2.g);
    expect(c1.b).toBe(c2.b);
    expect(c1.r).toBeGreaterThan(180);
    expect(c1.g).toBeGreaterThan(180);
    expect(c1.b).toBeGreaterThan(180);
  });
});
