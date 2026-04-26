// @vitest-environment node
//
// Reward shaper. Pure Node — no browser/audio/renderer imports. Verifies the
// event-based per-slot reward scaffold:
//   first observe → 0; subsequent observes diff prev-state to current.
//   kills + deaths come from state.killFeed (works in carrotChase too).
//   carrots come from state.stats.perPlayer.get(slot).carrotsEaten.
//   hazard hits come from rising edge of slowTimer / burnTimer.
//   per-tick burn fires while burnTimer > 0.
//   fall-off fires on state→'respawning' without prior 'splat'.
//   match-end win/loss bonus fires exactly once on false→true transition.
//   per-tick survival + airborne shaping.

import { describe, it, expect } from 'vitest';
import { RewardShaper } from '../reward';
import { makePlayer, makeState } from '../../__tests__/testHelpers';
import type { KillFeedEntry, MatchStats, PlayerSlot } from '../../types';

/** Build a stats object with carrotsEaten preset for the given slot(s). */
function makeStats(entries: Array<[PlayerSlot, number]>): MatchStats {
  const perPlayer = new Map<PlayerSlot, {
    bestStreak: number; timeAirborne: number; distanceTraveled: number; carrotsEaten: number;
  }>();
  for (const [slot, carrotsEaten] of entries) {
    perPlayer.set(slot, { bestStreak: 0, timeAirborne: 0, distanceTraveled: 0, carrotsEaten });
  }
  return { perPlayer };
}

describe('RewardShaper (event-based, pure Node)', () => {
  it('returns 0 on the first observe (no prev-state to diff against)', () => {
    const shaper = new RewardShaper('P1');
    const state = makeState({ players: [makePlayer({ id: 'P1', score: 0 })] });
    expect(shaper.observe(state)).toBe(0);
  });

  it('credits a carrot pickup with carrotBonus + per-tick survival', () => {
    const shaper = new RewardShaper('P1');
    // First observe — establishes prev-state with carrotsEaten = 0.
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' })],
      stats: makeStats([['P1', 0]]),
    }));
    // Second observe — carrotsEaten went 0 → 1.
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' })],
      stats: makeStats([['P1', 1]]),
    }));
    // 0.5 (carrot) + 0.001 (survival) = 0.501
    expect(r).toBeCloseTo(0.501, 4);
  });

  it('credits a stomp kill via killFeed entry where attacker === slot', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
    }));
    // killFeed has a new entry where P1 stomped P2.
    const killFeed: KillFeedEntry[] = [{ attacker: 'P1', victim: 'P2', timestamp: 1 }];
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
      killFeed,
    }));
    // 1.0 (kill) + 0.001 (survival) = 1.001
    expect(r).toBeCloseTo(1.001, 4);
  });

  it('credits multiple kills in a single tick via separate killFeed entries', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' }), makePlayer({ id: 'P3' })],
    }));
    // P1 stomped both P2 and P3 in the same tick.
    const killFeed: KillFeedEntry[] = [
      { attacker: 'P1', victim: 'P2', timestamp: 1 },
      { attacker: 'P1', victim: 'P3', timestamp: 1 },
    ];
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' }), makePlayer({ id: 'P3' })],
      killFeed,
    }));
    // 2 * 1.0 (kills) + 0.001 (survival) = 2.001
    expect(r).toBeCloseTo(2.001, 4);
  });

  it('applies deathPenalty when slot appears as victim in killFeed', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', state: 'idle' }), makePlayer({ id: 'P2' })],
    }));
    const killFeed: KillFeedEntry[] = [{ attacker: 'P2', victim: 'P1', timestamp: 1 }];
    const r = shaper.observe(makeState({
      // Player still alive (state='idle') even though killFeed says they died — we
      // isolate the killFeed.victim path. In practice the simulator would set
      // state='splat' too, but we don't fire deathPenalty off splat any more.
      players: [makePlayer({ id: 'P1', state: 'idle' }), makePlayer({ id: 'P2' })],
      killFeed,
    }));
    // -1.0 (death) + 0.001 (survival) = -0.999
    expect(r).toBeCloseTo(-0.999, 4);
  });

  it('fires winBonus exactly once on the matchOver false→true transition', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(
      makeState({
        players: [makePlayer({ id: 'P1' })],
        matchOver: false,
        winner: null,
      }),
    );
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
    expect(shaper.observe(state)).toBe(0);
  });

  it('reset() clears prev-state so the next observe returns 0 again', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' })],
      stats: makeStats([['P1', 0]]),
    }));
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' })],
      stats: makeStats([['P1', 2]]),
    }));
    shaper.reset();
    // First call after reset re-establishes prev-state and returns 0 — even
    // if carrotsEaten is non-zero (we don't credit accumulated history).
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' })],
      stats: makeStats([['P1', 4]]),
    }));
    expect(r).toBe(0);
  });

  it('honors custom weights overrides', () => {
    const shaper = new RewardShaper('P1', { killBonus: 100 });
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
    }));
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P2' })],
      killFeed: [{ attacker: 'P1', victim: 'P2', timestamp: 1 }],
    }));
    // 100 (custom kill) + 0.001 (survival) = 100.001
    expect(r).toBeCloseTo(100.001, 4);
  });

  it('hazard hit via slow rising edge fires hazardHitPenalty', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', slowTimer: 0 })],
    }));
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', slowTimer: 0.5 })],
    }));
    // -0.3 (hazard hit) + 0.001 (survival) = -0.299
    expect(r).toBeCloseTo(-0.299, 4);
  });

  it('hazard hit via burn rising edge fires hazardHitPenalty + per-tick burn', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', burnTimer: 0 })],
    }));
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', burnTimer: 1.5 })],
    }));
    // -0.3 (hazard hit) + -0.005 (per-tick burn) + 0.001 (survival) = -0.304
    expect(r).toBeCloseTo(-0.304, 4);
  });

  it('per-tick burn fires while burnTimer > 0 (no rising edge)', () => {
    const shaper = new RewardShaper('P1');
    // Prime with burnTimer already > 0 so there's no rising edge on the second observe.
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', burnTimer: 1.0 })],
    }));
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', burnTimer: 0.95 })],
    }));
    // -0.005 (burn DoT) + 0.001 (survival) = -0.004
    expect(r).toBeCloseTo(-0.004, 4);
  });

  it('fall-off penalty fires on idle → respawning transition', () => {
    const shaper = new RewardShaper('P1');
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', state: 'idle' })],
    }));
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', state: 'respawning' })],
    }));
    // -0.5 (fall-off). No survival — respawning is suppressed.
    expect(r).toBeCloseTo(-0.5, 4);
  });

  it('splat → respawning does NOT fire fall-off penalty (death already counted via killFeed)', () => {
    const shaper = new RewardShaper('P1');
    // Prime with idle.
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', state: 'idle' }), makePlayer({ id: 'P2' })],
    }));
    // Splat — death credited via killFeed.victim. State change to 'splat' is
    // not double-counted.
    const r1 = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', state: 'splat' }), makePlayer({ id: 'P2' })],
      killFeed: [{ attacker: 'P2', victim: 'P1', timestamp: 1 }],
    }));
    expect(r1).toBeCloseTo(-1.0, 4); // deathPenalty only — survival suppressed for splat state
    // Now splat → respawning. Fall-off must NOT fire because prev was splat.
    const r2 = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', state: 'respawning' }), makePlayer({ id: 'P2' })],
      // Same killFeed; the timestamp baseline now matches it so no kill is re-counted.
      killFeed: [{ attacker: 'P2', victim: 'P1', timestamp: 1 }],
    }));
    // No additional events. Respawning suppresses survival.
    expect(r2).toBeCloseTo(0, 4);
  });

  it('killFeed trim safety: shaper credits the kills it can see via timestamp baseline', () => {
    // The simulator caps killFeed at 10 entries (most-recent), so older kills
    // get trimmed. The shaper observes WITHIN a tick, so in practice it sees
    // the new entries before the trim. This test pins the timestamp-based
    // dedup defense: old entries don't get re-counted when the array shifts.
    const shaper = new RewardShaper('P1');
    // First observe — feed has entries up to timestamp 5, baseline becomes 5.
    const initialFeed: KillFeedEntry[] = [];
    for (let i = 1; i <= 5; i++) {
      initialFeed.push({ attacker: 'P3', victim: 'P4', timestamp: i });
    }
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P3' }), makePlayer({ id: 'P4' })],
      killFeed: initialFeed,
    }));
    // Tick 2: 7 new kills land, killFeed gets trimmed to last 10. Total = 12,
    // trim to last 10 → entries with timestamps 3..12. Three of them (10, 11, 12)
    // should credit P1 if attacker=P1.
    const trimmedFeed: KillFeedEntry[] = [];
    for (let i = 3; i <= 9; i++) {
      trimmedFeed.push({ attacker: 'P3', victim: 'P4', timestamp: i });
    }
    trimmedFeed.push({ attacker: 'P1', victim: 'P4', timestamp: 10 });
    trimmedFeed.push({ attacker: 'P1', victim: 'P4', timestamp: 11 });
    trimmedFeed.push({ attacker: 'P1', victim: 'P4', timestamp: 12 });
    const r = shaper.observe(makeState({
      players: [makePlayer({ id: 'P1' }), makePlayer({ id: 'P3' }), makePlayer({ id: 'P4' })],
      killFeed: trimmedFeed,
    }));
    // 3 * killBonus (1.0) + survival (0.001) = 3.001. Older entries with
    // ts <= 5 are skipped via the baseline check.
    expect(r).toBeCloseTo(3.001, 4);
  });

  it('carrotChase mode: kills score 0 but reward still fires via killFeed', () => {
    // In carrotChase mode, attacker.score isn't incremented on stomp (see
    // stomp.ts line 41). The killFeed entry is still pushed, so our event-based
    // detector still credits the kill. This test pins the bug fix.
    const shaper = new RewardShaper('P1');
    // Prime — both players at score 0.
    shaper.observe(makeState({
      players: [makePlayer({ id: 'P1', score: 0 }), makePlayer({ id: 'P2', score: 0 })],
    }));
    // P1 stomps P2 in carrotChase mode. P1's score stays at 0 (kills don't score).
    const r = shaper.observe(makeState({
      players: [
        makePlayer({ id: 'P1', score: 0 }),
        makePlayer({ id: 'P2', score: 0, state: 'splat' }),
      ],
      killFeed: [{ attacker: 'P1', victim: 'P2', timestamp: 1 }],
    }));
    // Even though score didn't change, we still credit the kill.
    // 1.0 (kill) + 0.001 (survival) = 1.001
    expect(r).toBeCloseTo(1.001, 4);
  });
});
