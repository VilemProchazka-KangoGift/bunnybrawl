import { describe, expect, it } from 'vitest';
import { VictoryCamera } from '../victoryCamera';
import { makePlayer, makeState } from '../../__tests__/testHelpers';
describe('victory camera', () => {
  it('eases to the centered winner without changing gameplay', () => {
    const p = makePlayer({ x: 624, y: 344 });
    const state = makeState({ matchOver: true, winner: p.id, players: [p] });
    const before = structuredClone(state), camera = new VictoryCamera();
    expect(camera.frame(state, 1000)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(camera.frame(state, 2500)?.scale).toBeCloseTo(1.6);
    const end = camera.frame(state, 4000)!;
    expect(end.scale).toBeCloseTo(2.2);
    expect(end.x + 640 * end.scale).toBeCloseTo(640);
    expect(end.y + 360 * end.scale).toBeCloseTo(360);
    expect(state).toEqual(before);
  });
  it('clamps every arena edge and resets on rematch, winner change and arena reset', () => {
    const p = makePlayer({ x: 0, y: 0 }), state = makeState({ matchOver: true, winner: p.id, players: [p] });
    const camera = new VictoryCamera(); camera.frame(state, 0);
    expect(camera.frame(state, 3000)).toEqual({ scale: 2.2, x: 0, y: 0 });
    p.x = 1248; p.y = 688;
    expect(camera.frame(state, 4000)?.x).toBeCloseTo(-1536);
    expect(camera.frame(state, 4000)?.y).toBeCloseTo(-864);
    state.matchOver = false; expect(camera.frame(state, 5000)).toBeNull();
    state.matchOver = true; expect(camera.frame(state, 6000)?.scale).toBe(1);
    camera.clear(); expect(camera.frame(state, 9000)?.scale).toBe(1);
    state.winner = null; expect(camera.frame(state, 10000)).toBeNull();
  });
});
