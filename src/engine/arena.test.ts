import { describe, it, expect } from 'vitest';
import { MEADOW_ARENA, getArena } from './arena';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

describe('Arena', () => {
  it('has correct dimensions', () => {
    expect(MEADOW_ARENA.width).toBe(CANVAS_WIDTH);
    expect(MEADOW_ARENA.height).toBe(CANVAS_HEIGHT);
  });

  it('has a ground platform spanning full width', () => {
    const ground = MEADOW_ARENA.platforms.find(p => p.y >= 650);
    expect(ground).toBeDefined();
    expect(ground!.width).toBe(CANVAS_WIDTH);
  });

  it('has floating platforms', () => {
    const floats = MEADOW_ARENA.platforms.filter(p => p.y < 650);
    expect(floats.length).toBeGreaterThanOrEqual(3);
  });

  it('has spawn points', () => {
    expect(MEADOW_ARENA.spawnPoints.length).toBeGreaterThanOrEqual(4);
  });

  it('spawn points are above platforms', () => {
    for (const spawn of MEADOW_ARENA.spawnPoints) {
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
