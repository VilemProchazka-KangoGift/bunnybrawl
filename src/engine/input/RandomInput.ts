// src/engine/input/RandomInput.ts
import type { InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput, PlayerInputContext } from './PlayerInput';
import type { SeededRNG } from '../net/prng';

export interface RandomInputConfig {
  /** Probability of jump=true per tick. Default 0.05. */
  jumpProb?: number;
  /** Probability of moving (left or right) per tick. Default 0.6. Direction is uniform 50/50. */
  moveProb?: number;
  /** Probability of down=true per tick. Default 0.05. */
  downProb?: number;
}

/** PlayerInput producing random InputState — deterministic when seeded, Math.random fallback. */
export class RandomInput implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly rng: SeededRNG | null;
  private readonly jumpProb: number;
  private readonly moveProb: number;
  private readonly downProb: number;

  constructor(slot: PlayerSlot, rng: SeededRNG | null, config?: RandomInputConfig) {
    this.slot = slot;
    this.rng = rng;
    this.jumpProb = config?.jumpProb ?? 0.05;
    this.moveProb = config?.moveProb ?? 0.6;
    this.downProb = config?.downProb ?? 0.05;
  }

  getAction(_state: Readonly<MatchState>, _ctx?: PlayerInputContext): InputState {
    // Roll order (fixed for determinism): move-yes/no, left-vs-right, jump, down.
    const r1 = this.rng ? this.rng.nextFloat() : Math.random();
    const r2 = this.rng ? this.rng.nextFloat() : Math.random();
    const r3 = this.rng ? this.rng.nextFloat() : Math.random();
    const r4 = this.rng ? this.rng.nextFloat() : Math.random();
    const moving = r1 < this.moveProb;
    const left = moving && r2 < 0.5;
    const right = moving && !left;
    const jump = r3 < this.jumpProb;
    const down = r4 < this.downProb;
    return { left, right, jump, down };
  }
}
