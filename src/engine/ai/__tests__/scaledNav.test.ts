import { describe, expect, it } from 'vitest';
import { buildAwareness } from '../awareness';
import { buildScaledArenaNav } from '../scaledNav';
import { makeArena, makePlayer, makeState } from '../../__tests__/testHelpers';

describe('scaled AI navigation', () => {
  it('adds a jump edge when the scaled jump arc reaches a higher platform', () => {
    const arena = makeArena({
      platforms: [
        { x: 0, y: 500, width: 1280, height: 20 },
        { x: 400, y: 300, width: 200, height: 20 },
      ],
    });

    const normal = buildScaledArenaNav(arena, 1);
    const enlarged = buildScaledArenaNav(arena, 1.5);

    expect(normal.edges[0].some(edge => edge.t === 1 && edge.y === 'j')).toBe(false);
    expect(enlarged.edges[0].some(edge => edge.t === 1 && edge.y === 'j')).toBe(true);
    expect(enlarged.nextHop[0][1]).toBe(1);
  });

  it('uses the player’s actual bounds to find the platform under a scaled body', () => {
    const arena = makeArena({
      platforms: [{ x: 120, y: 500, width: 100, height: 20 }],
    });
    const scaledBot = makePlayer({
      id: 'B1' as any,
      x: 80,
      y: 452,
      width: 48,
      height: 48,
    });

    const awareness = buildAwareness(scaledBot, makeState({ players: [scaledBot] }), arena, Infinity);
    expect(awareness.currentPlatformIdx).toBe(0);
  });
});
