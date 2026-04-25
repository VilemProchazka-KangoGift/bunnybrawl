// src/engine/headless/reward.ts
//
// Per-slot stateful reward shaper for ML self-play. Pure Node — no
// browser/audio/renderer imports. Compares the current MatchState against an
// internal prev-state snapshot and returns a scalar reward describing how good
// the just-completed tick was for the configured slot.
//
// Default shaping (all weights configurable via RewardWeights):
//   stomp kill        → +1.0
//   got stomped       → -1.0
//   carrot pickup     → +0.1
//   match win         → +5.0
//   match loss        → -2.0
//   per-tick survival → +0.001
//   per-tick airborne → -0.0005
//
// Score-delta heuristic disambiguates kills (+2 score) from carrots (+1 score):
// any 2-point increment is treated as a kill, any 1-point remainder as a
// carrot. In `mods.carrotChase`, kills award 0 score — kill bonuses are only
// reachable via score deltas in the default rule set, but the death penalty
// (rising edge into player.state === 'splat') is independent and works in
// every mode.

import type { MatchState, PlayerSlot, PlayerState } from '../types';

export interface RewardWeights {
  /** Bonus per stomp kill (per +2 score increment). Default 1.0. */
  killBonus?: number;
  /** Penalty per stomp death (rising edge into 'splat'). Default -1.0 (negative). */
  deathPenalty?: number;
  /** Bonus per carrot pickup (per +1 score increment, i.e. odd remainder). Default 0.1. */
  carrotBonus?: number;
  /** Bonus when matchOver flips true and self is the winner. Default 5.0. */
  winBonus?: number;
  /** Penalty when matchOver flips true and someone else is the winner. Default -2.0. */
  lossPenalty?: number;
  /** Per-tick bonus while alive and active. Default 0.001. */
  perTickSurvival?: number;
  /** Per-tick penalty while airborne. Default -0.0005. Stacks with survival. */
  perTickAirborne?: number;
}

const DEFAULTS: Required<RewardWeights> = {
  killBonus: 1.0,
  deathPenalty: -1.0,
  carrotBonus: 0.1,
  winBonus: 5.0,
  lossPenalty: -2.0,
  perTickSurvival: 0.001,
  perTickAirborne: -0.0005,
};

/**
 * Compute a scalar reward per tick for one slot. Stateful — call `observe`
 * once per `simulator.fixedUpdate(dt)` to get the reward for the just-completed
 * tick. Reset between episodes via `reset()`.
 */
export class RewardShaper {
  readonly slot: PlayerSlot;

  private readonly _w: Required<RewardWeights>;
  private _seen = false;
  private _prevScore = 0;
  private _prevPlayerState: PlayerState = 'idle';
  private _prevMatchOver = false;

  constructor(slot: PlayerSlot, weights?: RewardWeights) {
    this.slot = slot;
    this._w = { ...DEFAULTS, ...weights };
  }

  /**
   * Compute the reward from the slot's perspective for the just-completed
   * tick. Caller invokes AFTER simulator.fixedUpdate(). The shaper compares
   * the new state against its internal prev-state snapshot, returns the
   * scalar, and updates its prev-state.
   *
   * Returns 0 if the slot is not in state.players, or on the first call
   * (no prev-state to diff against).
   */
  observe(state: Readonly<MatchState>): number {
    const self = state.players.find(p => p.id === this.slot);
    if (!self) return 0;

    if (!this._seen) {
      this._prevScore = self.score;
      this._prevPlayerState = self.state;
      this._prevMatchOver = state.matchOver;
      this._seen = true;
      return 0;
    }

    let r = 0;

    // Score delta — split into kill (2pt) and carrot (1pt) components.
    // Kill in default mode = +2; carrot = +1. Negative deltas (e.g. respawn
    // resets via mods or future game changes) are ignored — we only credit
    // positive gains.
    const dScore = self.score - this._prevScore;
    if (dScore > 0) {
      const kills = Math.floor(dScore / 2);
      const carrots = dScore - kills * 2;
      r += this._w.killBonus * kills;
      r += this._w.carrotBonus * carrots;
    }
    this._prevScore = self.score;

    // Death — rising edge into 'splat'. PlayerStats has no deaths counter, so
    // we detect via state transition. Each splat fires once: respawn brings
    // state back to 'respawning' / 'idle' before another stomp can land.
    if (this._prevPlayerState !== 'splat' && self.state === 'splat') {
      r += this._w.deathPenalty;
    }
    this._prevPlayerState = self.state;

    // Match end — fires exactly once on the false→true transition.
    if (state.matchOver && !this._prevMatchOver) {
      if (state.winner === this.slot) {
        r += this._w.winBonus;
      } else if (state.winner !== null) {
        r += this._w.lossPenalty;
      }
      // null winner (draw / all disconnected) → no win/loss reward.
    }
    this._prevMatchOver = state.matchOver;

    // Per-tick shaping — only while alive and active. Skip during splat /
    // respawning so dead bots aren't rewarded for "surviving".
    if (self.active && self.state !== 'splat' && self.state !== 'respawning') {
      r += this._w.perTickSurvival;
      if (self.state === 'airborne') r += this._w.perTickAirborne;
    }

    return r;
  }

  /** Reset internal prev-state. Call when starting a new episode. */
  reset(): void {
    this._seen = false;
    this._prevScore = 0;
    this._prevPlayerState = 'idle';
    this._prevMatchOver = false;
  }
}
