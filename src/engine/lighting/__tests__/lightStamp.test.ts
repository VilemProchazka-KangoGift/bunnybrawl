import { describe, it, expect } from 'vitest';
import { lightStamp, effectiveIntensity, PHOTOSENSITIVITY_INTENSITY_CAP } from '../lightStamp';
import type { Light } from '../types';

const BASE: Light = {
  kind: 'point', x: 100, y: 100, color: { r: 255, g: 200, b: 100 },
  intensity: 0.8, radius: 40, falloff: 'inverse-square',
};

interface Stop { offset: number; color: string; }

function makeCtx() {
  const stops: Stop[] = [];
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    arc: () => calls.push('arc'),
    moveTo: () => calls.push('moveTo'),
    closePath: () => calls.push('closePath'),
    clip: () => calls.push('clip'),
    fillRect: () => calls.push('fillRect'),
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    createRadialGradient: () => ({
      addColorStop(offset: number, color: string) { stops.push({ offset, color }); },
    }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, stops, calls };
}

describe('lightStamp', () => {
  it('point light produces gradient + fillRect', () => {
    const { ctx, calls } = makeCtx();
    lightStamp(ctx, BASE, 0);
    expect(calls).toContain('fillRect');
    expect(calls).not.toContain('clip'); // point lights don't clip
  });

  it('spot light clips to cone before stamping', () => {
    const { ctx, calls } = makeCtx();
    lightStamp(ctx, { ...BASE, kind: 'spot', direction: 0, cone: Math.PI / 4 }, 0);
    expect(calls).toContain('save');
    expect(calls).toContain('clip');
    expect(calls).toContain('restore');
    expect(calls).toContain('fillRect');
  });

  it('intensity cap clamps base intensity below cap', () => {
    const { ctx, stops } = makeCtx();
    lightStamp(ctx, { ...BASE, intensity: 1.0 }, 0, PHOTOSENSITIVITY_INTENSITY_CAP);
    // First stop is the center alpha — equal to capped intensity.
    const center = stops[0];
    const m = center.color.match(/rgba\(\d+,\d+,\d+,([\d.]+)\)/);
    expect(m).toBeTruthy();
    const alpha = parseFloat(m![1]);
    expect(alpha).toBeLessThanOrEqual(PHOTOSENSITIVITY_INTENSITY_CAP + 1e-6);
  });

  it('zero effective intensity skips stamp', () => {
    const { ctx, calls } = makeCtx();
    lightStamp(ctx, { ...BASE, intensity: 0 }, 0);
    expect(calls).not.toContain('fillRect');
  });
});

describe('effectiveIntensity', () => {
  it('returns base intensity without flicker fields', () => {
    expect(effectiveIntensity(BASE, 0)).toBe(0.8);
    expect(effectiveIntensity(BASE, 999)).toBe(0.8);
  });

  it('returns base intensity when amplitude is 0', () => {
    expect(effectiveIntensity({ ...BASE, flicker: { seed: 1, amplitude: 0 } }, 5)).toBe(0.8);
  });

  it('produces deterministic per-tick output for same seed+tick', () => {
    const a = effectiveIntensity({ ...BASE, flicker: { seed: 42, amplitude: 0.2 } }, 10);
    const b = effectiveIntensity({ ...BASE, flicker: { seed: 42, amplitude: 0.2 } }, 10);
    expect(a).toBe(b);
  });

  it('different ticks produce different intensities', () => {
    const a = effectiveIntensity({ ...BASE, flicker: { seed: 42, amplitude: 0.2 } }, 10);
    const b = effectiveIntensity({ ...BASE, flicker: { seed: 42, amplitude: 0.2 } }, 11);
    expect(a).not.toBe(b);
  });

  it('different seeds at same tick produce different intensities', () => {
    const a = effectiveIntensity({ ...BASE, flicker: { seed: 1, amplitude: 0.2 } }, 10);
    const b = effectiveIntensity({ ...BASE, flicker: { seed: 2, amplitude: 0.2 } }, 10);
    expect(a).not.toBe(b);
  });

  it('flicker stays within ±amplitude/2 of base intensity', () => {
    const amp = 0.3;
    for (let tick = 0; tick < 200; tick++) {
      const v = effectiveIntensity({ ...BASE, flicker: { seed: 7, amplitude: amp } }, tick);
      expect(v).toBeGreaterThanOrEqual(BASE.intensity - amp / 2);
      expect(v).toBeLessThanOrEqual(BASE.intensity + amp / 2);
    }
  });
});
