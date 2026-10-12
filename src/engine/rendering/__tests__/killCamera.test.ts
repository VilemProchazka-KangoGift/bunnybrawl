import { describe, it, expect } from 'vitest';
import { KillCamera } from '../killCamera';
import { makeState } from '../../__tests__/testHelpers';

describe('directional kill camera', () => {
  it('uses a 1 percent zoom and the selected 5px sine kick, then settles', () => {
    const camera = new KillCamera(), state = makeState();
    expect(camera.frame(state, 0)).toBeNull();
    state.killFeed.push({attacker:'P1',victim:'P2',timestamp:1});
    expect(camera.frame(state, 1000)).toEqual({scale:1.01,y:0});
    expect(camera.frame(state, 1045)?.y).toBeCloseTo(3.75);
    expect(camera.frame(state, 1135)?.y).toBeCloseTo(-1.25);
    expect(camera.frame(state, 1180)).toBeNull();
  });
  it('does not replay an existing feed on initialization, reset or repeated frames', () => {
    const camera = new KillCamera(), state = makeState({killFeed:[{attacker:'P1',victim:'P2',timestamp:1}]});
    expect(camera.frame(state, 0)).toBeNull();
    state.killFeed.push({attacker:'P2',victim:'P1',timestamp:2});
    expect(camera.frame(state, 100)).not.toBeNull();
    expect(camera.frame(state, 400)).toBeNull();
    camera.clear(); expect(camera.frame(state, 500)).toBeNull();
  });
});
