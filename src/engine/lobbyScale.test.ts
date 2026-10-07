import { describe, expect, it, vi } from 'vitest';
import { LobbyGame } from './lobbyGame';
import { registerBuiltinArenas } from './arenas';
import { registerBuiltinCharacters } from './characters';
import { GROUND_Y, WALL_X, WALL_WIDTH, READY_ZONE_X } from './lobbyConstants';
import { normalizeCharacterScale } from './characterScale';
vi.mock('./audio', () => ({ audio: { play: vi.fn(), playAnimal: vi.fn() } }));
registerBuiltinArenas();
registerBuiltinCharacters();
function isolated(scale: number) {
  const game = new LobbyGame({ botCount: 0, isMobile: true, characterScale: scale });
  game.extraChars = [];
  return game;
}
describe('scaled lobby movement', () => {
  it('rejects invalid sizes and bounds experiments', () => {
    expect(normalizeCharacterScale(NaN)).toBe(1);
    expect(normalizeCharacterScale(Infinity)).toBe(1);
    expect(normalizeCharacterScale(0)).toBe(1);
    expect(normalizeCharacterScale(9)).toBe(1.5);
  });
  it('scales body and jump height while preserving jump duration', () => {
    const results = [1, 1.25, 1.5].map(scale => {
      const game = isolated(scale);
      const p = game.players[0];
      expect(p.width).toBe(32 * scale);
      expect(p.y + p.height).toBe(GROUND_Y);
      game.update(1 / 60, new Set(['w']));
      let minFeet = p.y + p.height;
      let ticks = 1;
      while (p.state === 'airborne' && ticks < 120) {
        game.update(1 / 60, new Set());
        minFeet = Math.min(minFeet, p.y + p.height);
        ticks++;
      }
      game.destroy();
      return { height: GROUND_Y - minFeet, ticks };
    });
    expect(results[1].height / results[0].height).toBeCloseTo(1.25, 4);
    expect(results[2].height / results[0].height).toBeCloseTo(1.5, 4);
    expect(results.map(r => r.ticks)).toEqual([results[0].ticks, results[0].ticks, results[0].ticks]);
  });
  it.each([1, 1.25, 1.5])('keeps the wall a jumping tutorial at %sx', scale => {
    const game = isolated(scale);
    const p = game.players[0];
    p.x = WALL_X - p.width - 5;
    for (let i = 0; i < 60; i++) game.update(1 / 60, new Set(['d']));
    expect(p.x + p.width).toBeCloseTo(WALL_X, 3);
    for (let i = 0; i < 90; i++) game.update(1 / 60, new Set(['d', 'w']));
    expect(p.x).toBeGreaterThan(WALL_X + WALL_WIDTH);
    expect(p.x + p.width).toBeGreaterThan(READY_ZONE_X);
    expect(game.getReadyPlayers()).toContain(p);
    game.destroy();
  });
});
