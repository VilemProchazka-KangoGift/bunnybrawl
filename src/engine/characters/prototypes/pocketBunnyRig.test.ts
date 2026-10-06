import { describe, expect, it } from 'vitest';
import { selectPocketBunnyPose } from './pocketBunnyRig';

describe('Pocket Plush Bunny sit motion', () => {
  it('uses the same seated silhouette throughout the idle sit action', () => {
    for (const progress of [0, .1, .5, .9, 1]) {
      expect(selectPocketBunnyPose('idle', 0, false, 1, progress, 1)).toBe(7);
    }
  });

  it('uses the seated silhouette for grounded crouch, including while moving', () => {
    expect(selectPocketBunnyPose('idle', 0, false, -1, 0, .6)).toBe(7);
    expect(selectPocketBunnyPose('run', 2, false, -1, 0, .6)).toBe(7);
    expect(selectPocketBunnyPose('idle', 0, false, -1, 0, .7)).toBe(9);
  });

  it('shows a seated exit before returning to authored walk poses', () => {
    expect(selectPocketBunnyPose('run', 0, false, 1, .2, 1)).toBe(7);
    expect(selectPocketBunnyPose('run', 0, false, 1, .8, 1)).toBe(1);
    expect(selectPocketBunnyPose('run', 2, false, -1, 0, 1)).toBe(3);
  });
});
