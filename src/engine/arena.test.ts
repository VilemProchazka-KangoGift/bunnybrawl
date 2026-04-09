import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinArenas } from './arenas/builtin';
import { getArena } from './arenas';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

beforeAll(() => {
  registerBuiltinArenas();
});

describe('Arena', () => {
  it('has correct dimensions', () => {
    const meadow = getArena('meadow');
    expect(meadow.width).toBe(CANVAS_WIDTH);
    expect(meadow.height).toBe(CANVAS_HEIGHT);
  });

  it('has a ground platform spanning full width', () => {
    const meadow = getArena('meadow');
    const ground = meadow.platforms.find(p => p.y >= 650);
    expect(ground).toBeDefined();
    expect(ground!.width).toBe(CANVAS_WIDTH);
  });

  it('has floating platforms', () => {
    const meadow = getArena('meadow');
    const floats = meadow.platforms.filter(p => p.y < 650);
    expect(floats.length).toBeGreaterThanOrEqual(3);
  });

  it('has spawn points', () => {
    const meadow = getArena('meadow');
    expect(meadow.spawnPoints.length).toBeGreaterThanOrEqual(4);
  });

  it('spawn points are above platforms', () => {
    const meadow = getArena('meadow');
    for (const spawn of meadow.spawnPoints) {
      expect(spawn.x).toBeGreaterThan(0);
      expect(spawn.x).toBeLessThan(CANVAS_WIDTH);
      expect(spawn.y).toBeGreaterThan(0);
      expect(spawn.y).toBeLessThan(CANVAS_HEIGHT);
    }
  });

  it('getArena returns meadow arena', () => {
    const arena = getArena();
    expect(arena.name).toBe('Meadow');
  });
});
