import { describe, it, expect, beforeAll } from 'vitest';
import { mirrorArena } from './operations';
import { makeArena } from '../__tests__/testHelpers';
import { registerBuiltinArenas } from './builtin';
import { CANVAS_WIDTH } from '../constants';
import type { Arena } from '../types';

beforeAll(() => {
  registerBuiltinArenas();
});

describe('mirrorArena', () => {
  it('mirrors platform x coordinates', () => {
    const arena = makeArena({
      platforms: [
        { x: 100, y: 660, width: 200, height: 20 },
        { x: 400, y: 500, width: 150, height: 20 },
      ],
    });
    const mirrored = mirrorArena(arena);
    // mirrorX = CANVAS_WIDTH - x - width
    expect(mirrored.platforms[0].x).toBe(CANVAS_WIDTH - 100 - 200);
    expect(mirrored.platforms[1].x).toBe(CANVAS_WIDTH - 400 - 150);
  });

  it('preserves platform y, width, height', () => {
    const arena = makeArena({
      platforms: [{ x: 100, y: 660, width: 200, height: 20 }],
    });
    const mirrored = mirrorArena(arena);
    expect(mirrored.platforms[0].y).toBe(660);
    expect(mirrored.platforms[0].width).toBe(200);
    expect(mirrored.platforms[0].height).toBe(20);
  });

  it('mirrors spawn point x coordinates', () => {
    const arena = makeArena({
      spawnPoints: [{ x: 100, y: 600 }, { x: 800, y: 600 }],
    });
    const mirrored = mirrorArena(arena);
    // mirrorPt = CANVAS_WIDTH - x
    expect(mirrored.spawnPoints[0].x).toBe(CANVAS_WIDTH - 100);
    expect(mirrored.spawnPoints[1].x).toBe(CANVAS_WIDTH - 800);
  });

  it('mirrors hazard zone x coordinates', () => {
    const arena = makeArena({
      hazardZones: [{ x: 200, y: 650, width: 100, height: 20 }],
    });
    const mirrored = mirrorArena(arena);
    expect(mirrored.hazardZones![0].x).toBe(CANVAS_WIDTH - 200 - 100);
    expect(mirrored.hazardZones![0].y).toBe(650);
    expect(mirrored.hazardZones![0].width).toBe(100);
  });

  it('negates current vx in effect zones', () => {
    const arena = makeArena({
      effectZones: [{ type: 'current' as const, x: 100, y: 100, width: 200, height: 200, vx: 50 }],
    });
    const mirrored = mirrorArena(arena);
    expect(mirrored.effectZones![0].vx).toBe(-50);
    expect(mirrored.effectZones![0].x).toBe(CANVAS_WIDTH - 100 - 200);
  });

  it('mirrors noSpawnZones and carrotZones', () => {
    const arena = makeArena({
      noSpawnZones: [{ x: 100, y: 200, width: 50, height: 60 }],
      carrotZones: [{ x: 300, y: 400, width: 80, height: 90 }],
    });
    const mirrored = mirrorArena(arena);
    expect(mirrored.noSpawnZones![0].x).toBe(CANVAS_WIDTH - 100 - 50);
    expect(mirrored.carrotZones![0].x).toBe(CANVAS_WIDTH - 300 - 80);
  });

  it('mirrors navHints inZone x and approachX', () => {
    const arena = makeArena({
      navHints: [{
        inZone: { x: 100, y: 200, width: 50, height: 60 },
        approachX: 300,
        type: 'j' as any,
      }],
    });
    const mirrored = mirrorArena(arena);
    expect(mirrored.navHints![0].inZone.x).toBe(CANVAS_WIDTH - 100 - 50);
    expect(mirrored.navHints![0].approachX).toBe(CANVAS_WIDTH - 300);
  });

  it('does not mutate original arena', () => {
    const arena = makeArena({
      platforms: [{ x: 100, y: 660, width: 200, height: 20 }],
      spawnPoints: [{ x: 100, y: 600 }],
    });
    const originalX = arena.platforms[0].x;
    const originalSpawnX = arena.spawnPoints[0].x;

    mirrorArena(arena);

    expect(arena.platforms[0].x).toBe(originalX);
    expect(arena.spawnPoints[0].x).toBe(originalSpawnX);
  });

  it('handles arena with no optional fields', () => {
    const arena: Arena = makeArena();
    // Should not throw even with undefined optional arrays
    expect(() => mirrorArena(arena)).not.toThrow();
  });
});
