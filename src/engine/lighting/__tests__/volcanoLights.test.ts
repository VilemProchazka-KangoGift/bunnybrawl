import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { getArenaLights } from '../../arenas/operations';

describe('volcano arena lights catalog', () => {
  beforeAll(() => {
    registerBuiltinArenas();
  });

  it('exposes 3 lava emissive lights centered on the hazard zones', () => {
    const lights = getArenaLights('volcano');
    expect(lights.length).toBe(3);
    // Hazard zones are at x∈{275, 835, 580}, y∈{694, 694, 654}, widths 130/130/60.
    // Emitter centers should sit roughly above each zone.
    const xs = lights.map(l => l.x).sort((a, b) => a - b);
    expect(xs).toEqual([340, 610, 900]);
    for (const l of lights) {
      expect(l.kind).toBe('point');
      expect(l.color).toEqual({ r: 255, g: 80, b: 30 });
      expect(l.falloff).toBe('inverse-square');
      expect(l.intensity).toBeCloseTo(0.9, 5);
    }
  });

  it('all lava lights have distinct flicker seeds', () => {
    const lights = getArenaLights('volcano');
    const seeds = lights.map(l => l.flicker?.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const s of seeds) expect(s).toBeDefined();
  });
});
