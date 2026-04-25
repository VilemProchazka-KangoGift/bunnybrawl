// @vitest-environment node
//
// Reward shaper (Task 4.3). Pure Node — no browser/audio/renderer imports.
// Verifies the documented per-slot reward scaffold:
//   first observe → 0; subsequent observes diff prev-state to current.
//   score deltas split into kill (+2) / carrot (+1) buckets.
//   death penalty fires on 'splat' rising edge.
//   match-end win/loss bonus fires exactly once on false→true transition.
//   per-tick survival + airborne shaping.

import { describe, it, expect } from 'vitest';
import { RewardShaper } from '../reward';
import { makePlayer, makeState } from '../../__tests__/testHelpers';

describe('RewardShaper (Task 4.3 — pure Node)', () => {
  it('returns 0 on the first observe (no prev-state to diff against)', () => {
    const shaper = new RewardShaper('P1');
    const state = makeState({ players: [makePlayer({ id: 'P1', score: 0 })] });
    expect(shaper.observe(state)).toBe(0);
  });

  it('credits a carrot pickup with carrotBonus + per-tick survival', () => {
    const shaper = new RewardShaper('P1');
    // First observe — establishes prev-state at score 0.
    shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 0 })] }));
    // Second observe — score went 0 → 1. Carrot pickup.
    const r = shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 1 })] }));
    // 0.1 (carrot) + 0.001 (survival) = 0.101
    expect(r).toBeCloseTo(0.101, 4);
  });

  it('credits a stomp kill with killBonus + per-tick survival', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 0 })] }));
    // Score went 0 → 2. One kill.
    const r = shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 2 })] }));
    // 1.0 (kill) + 0.001 (survival) = 1.001
    expect(r).toBeCloseTo(1.001, 4);
  });

  it('splits a +3 score delta into one kill + one carrot', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 0 })] }));
    // Score went 0 → 3. One kill (+2) + one carrot (+1).
    const r = shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 3 })] }));
    // 1.0 (kill) + 0.1 (carrot) + 0.001 (survival) = 1.101
    expect(r).toBeCloseTo(1.101, 4);
  });

  it('applies deathPenalty on the rising edge into splat state', () => {
    const shaper = new RewardShaper('P1');
    // Prime with non-splat state.
    shaper.observe(makeState({ players: [makePlayer({ id: 'P1', state: 'idle' })] }));
    // Transition to splat — rising edge.
    const r = shaper.observe(
      makeState({ players: [makePlayer({ id: 'P1', state: 'splat' })] }),
    );
    // -1.0 death only (splat state suppresses survival/airborne shaping).
    expect(r).toBeCloseTo(-1.0, 4);
  });

  it('fires winBonus exactly once on the matchOver false→true transition', () => {
    const shaper = new RewardShaper('P1');
    // Prime with active match.
    shaper.observe(
      makeState({
        players: [makePlayer({ id: 'P1' })],
        matchOver: false,
        winner: null,
      }),
    );
    // Match flips over with self as winner.
    const r1 = shaper.observe(
      makeState({
        players: [makePlayer({ id: 'P1' })],
        matchOver: true,
        winner: 'P1',
      }),
    );
    // 5.0 (win) + 0.001 (survival) = 5.001
    expect(r1).toBeCloseTo(5.001, 4);
    // Subsequent ticks with matchOver still true must NOT re-fire the bonus.
    const r2 = shaper.observe(
      makeState({
        players: [makePlayer({ id: 'P1' })],
        matchOver: true,
        winner: 'P1',
      }),
    );
    // Just survival now — no re-fire.
    expect(r2).toBeCloseTo(0.001, 4);
  });

  it('fires lossPenalty exactly once when matchOver flips with a different winner', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(
      makeState({
        players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
        matchOver: false,
        winner: null,
      }),
    );
    const r1 = shaper.observe(
      makeState({
        players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
        matchOver: true,
        winner: 'P2',
      }),
    );
    // -2.0 (loss) + 0.001 (survival) = -1.999
    expect(r1).toBeCloseTo(-1.999, 4);
    // Subsequent tick must not re-fire.
    const r2 = shaper.observe(
      makeState({
        players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
        matchOver: true,
        winner: 'P2',
      }),
    );
    expect(r2).toBeCloseTo(0.001, 4);
  });

  it('adds per-tick survival when alive and not splat/respawning', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({ players: [makePlayer({ id: 'P1', state: 'idle' })] }));
    // Stable state — no other deltas.
    const r = shaper.observe(
      makeState({ players: [makePlayer({ id: 'P1', state: 'idle' })] }),
    );
    expect(r).toBeCloseTo(0.001, 4);
  });

  it('adds per-tick airborne penalty (stacks with survival) when state==airborne', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(
      makeState({ players: [makePlayer({ id: 'P1', state: 'airborne', vy: -100 })] }),
    );
    const r = shaper.observe(
      makeState({ players: [makePlayer({ id: 'P1', state: 'airborne', vy: -100 })] }),
    );
    // 0.001 (survival) + (-0.0005) (airborne) = 0.0005
    expect(r).toBeCloseTo(0.0005, 4);
  });

  it('returns 0 when the slot is not in state.players', () => {
    const shaper = new RewardShaper('P1');
    const state = makeState({ players: [makePlayer({ id: 'P2' })] });
    expect(shaper.observe(state)).toBe(0);
    // Even after multiple calls — never crashes, never accumulates.
    expect(shaper.observe(state)).toBe(0);
  });

  it('reset() clears prev-state so the next observe returns 0 again', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 0 })] }));
    shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 2 })] }));
    shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 4 })] }));
    shaper.reset();
    // First call after reset re-establishes prev-state and returns 0 — even
    // if the score is non-zero (we don't credit accumulated history).
    const r = shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 4 })] }));
    expect(r).toBe(0);
  });

  it('honors custom weights overrides', () => {
    const shaper = new RewardShaper('P1', { killBonus: 100 });
    shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 0 })] }));
    const r = shaper.observe(makeState({ players: [makePlayer({ id: 'P1', score: 2 })] }));
    // 100 (custom kill) + 0.001 (survival) = 100.001
    expect(r).toBeCloseTo(100.001, 4);
  });
});
