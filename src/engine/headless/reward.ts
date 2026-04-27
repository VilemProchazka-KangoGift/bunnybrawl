// src/engine/headless/reward.ts
//
// Per-slot stateful reward shaper for ML self-play. Pure Node — no
// browser/audio/renderer imports. Compares the current MatchState against an
// internal prev-state snapshot and returns a scalar reward describing how good
// the just-completed tick was for the configured slot.
//
// Detection is event-based — kills come from `state.killFeed` (the canonical
// stomp event log), carrots from `state.stats.perPlayer.get(slot).carrotsEaten`,
// hazard hits from rising edges of `slowTimer` / `burnTimer`, fall-offs from
// the player.state transition into 'respawning' without a 'splat' interlude,
// and match end from the `matchOver` false→true edge.
//
// This works uniformly across game modes — including `mods.carrotChase`, where
// stomps award 0 score so any score-delta heuristic would silently miss kills.
//
// Default shaping (all weights configurable via RewardWeights):
//   stomp kill         → +1.0   (matches game ratio kill:carrot 2:1)
//   got stomped        → -1.0
//   carrot pickup      → +0.5
//   match win          → +5.0
//   match loss         → -2.0
//   per-tick survival  → +0.001
//   per-tick airborne  → -0.0005
//   hazard hit         → -0.3   (rising edge of slow OR burn)
//   per-tick burn      → -0.005 (lava DoT while burning)
//   fall-off           → -0.5   (state→'respawning' without splat first)

import type { MatchState, PlayerSlot, PlayerState } from '../types';

export interface RewardWeights {
  /** Bonus per stomp kill (per killFeed entry where attacker === slot). Default 1.0. */
  killBonus?: number;
  /** Penalty per stomp death (per killFeed entry where victim === slot). Default -1.0. */
  deathPenalty?: number;
  /** Bonus per carrot pickup (per +1 to stats.perPlayer.get(slot).carrotsEaten). Default 0.5. */
  carrotBonus?: number;
  /** Bonus when matchOver flips true and self is the winner. Default 5.0. */
  winBonus?: number;
  /** Penalty when matchOver flips true and someone else is the winner. Default -2.0. */
  lossPenalty?: number;
  /** Per-tick bonus while alive and active. Default 0.001. */
  perTickSurvival?: number;
  /** Per-tick penalty while airborne. Default -0.0005. Stacks with survival. */
  perTickAirborne?: number;
  /** Penalty on the rising edge of slowTimer or burnTimer (thorn/ghost/lava hit). Default -0.3. */
  hazardHitPenalty?: number;
  /** Per-tick penalty while burnTimer > 0 (lava DoT). Default -0.005. */
  burnTickPenalty?: number;
  /** Penalty when state transitions into 'respawning' without going through 'splat' (fall-off). Default -0.5. */
  fallOffPenalty?: number;
}

export const DEFAULT_REWARD_WEIGHTS: Readonly<Required<RewardWeights>> = {
  killBonus: 1.0,
  deathPenalty: -1.0,
  carrotBonus: 0.5,
  winBonus: 5.0,
  lossPenalty: -2.0,
  perTickSurvival: 0.001,
  perTickAirborne: -0.0005,
  hazardHitPenalty: -0.3,
  burnTickPenalty: -0.005,
  fallOffPenalty: -0.5,
};

/** Ordered list of weight keys, derived once from defaults. */
export const REWARD_WEIGHT_KEYS = Object.keys(DEFAULT_REWARD_WEIGHTS) as ReadonlyArray<
  keyof Required<RewardWeights>
>;

/**
 * Convert a resolved weights object into a flat `prefix.<key>: value` record,
 * suitable for embedding in NDJSON `MatchHeader.tags` so consumed datasets
 * carry the shaping that produced them.
 */
export function weightsToTagRecord(
  weights: Required<RewardWeights>,
  prefix = 'reward',
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of REWARD_WEIGHT_KEYS) out[`${prefix}.${k}`] = weights[k];
  return out;
}

/**
 * Compute a scalar reward per tick for one slot. Stateful — call `observe`
 * once per `simulator.fixedUpdate(dt)` to get the reward for the just-completed
 * tick. Reset between episodes via `reset()`.
 */
export class RewardShaper {
  readonly slot: PlayerSlot;

  private readonly _w: Required<RewardWeights>;
  private _seen = false;
  private _prevCarrotsEaten = 0;
  /**
   * Highest killFeed timestamp seen so far. Initial value Number.NEGATIVE_INFINITY
   * so the first tick doesn't credit historical kills. After init we scan the
   * killFeed for the max timestamp and stash it as the baseline.
   */
  private _lastKillFeedTimestamp = Number.NEGATIVE_INFINITY;
  private _prevPlayerState: PlayerState = 'idle';
  private _prevSlowTimer = 0;
  private _prevBurnTimer = 0;
  private _prevMatchOver = false;

  constructor(slot: PlayerSlot, weights?: RewardWeights) {
    this.slot = slot;
    this._w = { ...DEFAULT_REWARD_WEIGHTS, ...weights };
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
      this._prevCarrotsEaten = state.stats?.perPlayer?.get(this.slot)?.carrotsEaten ?? 0;
      this._prevPlayerState = self.state;
      this._prevSlowTimer = self.slowTimer;
      this._prevBurnTimer = self.burnTimer;
      this._prevMatchOver = state.matchOver;
      // Set baseline to the highest existing killFeed timestamp so prior
      // entries don't get credited on the first observe. Empty feed → -Infinity
      // so the first new entry (timestamp typically 0+) is always greater.
      let maxTs = Number.NEGATIVE_INFINITY;
      for (const e of state.killFeed) if (e.timestamp > maxTs) maxTs = e.timestamp;
      this._lastKillFeedTimestamp = maxTs;
      this._seen = true;
      return 0;
    }

    let r = 0;

    // Kill / death events from killFeed. Scan for entries with a timestamp
    // strictly greater than our last-seen baseline. Works in carrotChase too
    // (entries are pushed regardless of score). Trim-safe: `state.killFeed`
    // is capped at 10, but the timestamp baseline keeps us from re-counting.
    let maxTs = this._lastKillFeedTimestamp;
    for (const e of state.killFeed) {
      if (e.timestamp <= this._lastKillFeedTimestamp) continue;
      if (e.attacker === this.slot) r += this._w.killBonus;
      if (e.victim === this.slot) r += this._w.deathPenalty;
      if (e.timestamp > maxTs) maxTs = e.timestamp;
    }
    this._lastKillFeedTimestamp = maxTs;

    // Carrot pickups via per-player stats. Works in all modes.
    const carrotsEaten = state.stats?.perPlayer?.get(this.slot)?.carrotsEaten ?? 0;
    const dCarrots = carrotsEaten - this._prevCarrotsEaten;
    if (dCarrots > 0) r += this._w.carrotBonus * dCarrots;
    this._prevCarrotsEaten = carrotsEaten;

    // Hazard hit — rising edge of either slowTimer or burnTimer. Both timers
    // are set to THORN_SLOW_DURATION on hit (player.slowTimer for thorn/ghost,
    // both for lava). One penalty per hit-event regardless of which timer
    // triggered. Don't fire during invincible — the hit was already counted
    // at the start of the i-frames; later transitions are visual artifacts.
    const hazardHitNow =
      (self.slowTimer > 0 && this._prevSlowTimer <= 0) ||
      (self.burnTimer > 0 && this._prevBurnTimer <= 0);
    if (hazardHitNow) r += this._w.hazardHitPenalty;

    // Per-tick burn (lava DoT) while burnTimer > 0.
    if (self.burnTimer > 0) r += this._w.burnTickPenalty;

    // Fall-off: transitioned into 'respawning' without going through 'splat'.
    // Splat-rising-edge is covered by the killFeed.victim path above (every
    // current splat cause is a stomp), so we deliberately don't double-count.
    if (
      self.state === 'respawning' &&
      this._prevPlayerState !== 'respawning' &&
      this._prevPlayerState !== 'splat'
    ) {
      r += this._w.fallOffPenalty;
    }

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

    // Update prev-state for next observe.
    this._prevSlowTimer = self.slowTimer;
    this._prevBurnTimer = self.burnTimer;
    this._prevPlayerState = self.state;

    return r;
  }

  /** Reset internal prev-state. Call when starting a new episode. */
  reset(): void {
    this._seen = false;
    this._prevCarrotsEaten = 0;
    this._lastKillFeedTimestamp = Number.NEGATIVE_INFINITY;
    this._prevPlayerState = 'idle';
    this._prevSlowTimer = 0;
    this._prevBurnTimer = 0;
    this._prevMatchOver = false;
  }
}
