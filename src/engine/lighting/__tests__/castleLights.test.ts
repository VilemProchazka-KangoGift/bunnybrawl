import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { getArenaLights } from '../../arenas/operations';

describe('castle arena lights catalog', () => {
  beforeAll(() => {
    registerBuiltinArenas();
  });

  it('exposes four sconces flanking the action lanes', () => {
    const lights = getArenaLights('castle');
    expect(lights.length).toBe(4);
    const xs = lights.map(l => l.x).sort((a, b) => a - b);
    expect(xs).toEqual([100, 400, 880, 1080]);
  });

  it('all sconces share the cool-blue color and inverse-square falloff', () => {
    const lights = getArenaLights('castle');
    for (const l of lights) {
      expect(l.kind).toBe('point');
      expect(l.color).toEqual({ r: 151, g: 198, b: 228 });
      expect(l.falloff).toBe('inverse-square');
      expect(l.y).toBe(580);
    }
  });

  it('each sconce has a distinct flicker seed', () => {
    const lights = getArenaLights('castle');
    const seeds = lights.map(l => l.flicker?.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const s of seeds) expect(s).toBeDefined();
  });

  it('returns empty for arenas without a catalog', () => {
    expect(getArenaLights('meadow')).toEqual([]);
  });

  it('returns empty for unknown arena IDs (test fixture safety)', () => {
    expect(getArenaLights('does-not-exist')).toEqual([]);
  });
});
