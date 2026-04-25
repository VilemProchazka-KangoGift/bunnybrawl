// src/engine/input/__tests__/RandomInput.test.ts
import { describe, it, expect } from 'vitest';
import { RandomInput } from '../RandomInput';
import { SeededRNG } from '../../net/prng';
import { makeState } from '../../__tests__/testHelpers';
import type { MatchState, PlayerSlot } from '../../types';

describe('RandomInput', () => {
  it('default config produces all four boolean fields', () => {
    const input = new RandomInput('P1' as PlayerSlot, new SeededRNG(1));
    const state = makeState({ players: [] });
    const action = input.getAction(state);

    expect(typeof action.left).toBe('boolean');
    expect(typeof action.right).toBe('boolean');
    expect(typeof action.jump).toBe('boolean');
    expect(typeof action.down).toBe('boolean');
  });

  it('two RandomInputs with the same seed produce identical sequences', () => {
    const a = new RandomInput('P1' as PlayerSlot, new SeededRNG(42));
    const b = new RandomInput('P1' as PlayerSlot, new SeededRNG(42));
    const state = makeState({ players: [] });

    for (let i = 0; i < 100; i++) {
      expect(a.getAction(state)).toEqual(b.getAction(state));
    }
  });

  it('jumpProb=1, moveProb=0, downProb=0 always yields jump-only', () => {
    const input = new RandomInput('P1' as PlayerSlot, new SeededRNG(7), {
      jumpProb: 1,
      moveProb: 0,
      downProb: 0,
    });
    const state = makeState({ players: [] });

    for (let i = 0; i < 50; i++) {
      expect(input.getAction(state)).toEqual({ left: false, right: false, jump: true, down: false });
    }
  });

  it('jumpProb=0, moveProb=1, downProb=0 always yields exactly one of left/right', () => {
    const input = new RandomInput('P1' as PlayerSlot, new SeededRNG(99), {
      jumpProb: 0,
      moveProb: 1,
      downProb: 0,
    });
    const state = makeState({ players: [] });

    for (let i = 0; i < 100; i++) {
      const action = input.getAction(state);
      // Exactly one of left/right is true.
      expect(action.left !== action.right).toBe(true);
      expect(action.jump).toBe(false);
      expect(action.down).toBe(false);
    }
  });

  it('jumpProb=0, moveProb=0, downProb=0 always yields all-false', () => {
    const input = new RandomInput('P1' as PlayerSlot, new SeededRNG(123), {
      jumpProb: 0,
      moveProb: 0,
      downProb: 0,
    });
    const state = makeState({ players: [] });

    for (let i = 0; i < 50; i++) {
      expect(input.getAction(state)).toEqual({ left: false, right: false, jump: false, down: false });
    }
  });

  it('Math.random fallback works when rng is null', () => {
    const input = new RandomInput('P1' as PlayerSlot, null);
    const state = makeState({ players: [] });

    for (let i = 0; i < 10; i++) {
      const action = input.getAction(state);
      expect(typeof action.left).toBe('boolean');
      expect(typeof action.right).toBe('boolean');
      expect(typeof action.jump).toBe('boolean');
      expect(typeof action.down).toBe('boolean');
    }
  });

  it('exposes the slot passed to the constructor', () => {
    const input = new RandomInput('B3' as PlayerSlot, new SeededRNG(0));
    expect(input.slot).toBe('B3');
  });

  it('does not consult the state argument', () => {
    const input = new RandomInput('P1' as PlayerSlot, new SeededRNG(5));
    // State has no players matching the slot — must still produce valid output.
    const state = makeState({ players: [] });
    const action = input.getAction(state);
    expect(typeof action.left).toBe('boolean');
    expect(typeof action.right).toBe('boolean');
    expect(typeof action.jump).toBe('boolean');
    expect(typeof action.down).toBe('boolean');

    // Also tolerates a synthetic null-ish state (state argument is unused).
    const action2 = input.getAction(null as unknown as MatchState);
    expect(typeof action2.left).toBe('boolean');
  });
});
