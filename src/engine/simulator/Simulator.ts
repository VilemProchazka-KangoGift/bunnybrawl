import type { MatchState, MatchPhase, Arena, PlayerSlot } from '../types';
import type { SeededRNG } from '../net/prng';
import type { PlayerInput } from '../input/PlayerInput';
import type { SimulatorEvents, SimulatorOptions } from './types';

const NOT_IMPLEMENTED = 'Simulator: implementation lands in Task 3.2.';

/**
 * Pure simulation core — Node-safe. No browser, no DOM, no audio imports.
 * Side effects flow through SimulatorEvents (audio, phase change, match end).
 *
 * This file is a SCAFFOLD (Task 3.1). The constructor stores args; all methods
 * throw or return safe defaults. Real wiring happens in Task 3.2 when state +
 * RNG + gameplay systems migrate from GameLoop.
 */
export class Simulator {
  private readonly _arena: Arena;
  private readonly _events: SimulatorEvents;
  private _rng?: SeededRNG;

  constructor(opts: SimulatorOptions) {
    this._arena = opts.arena;
    this._events = opts.events ?? {};
    this._rng = opts.rng;
    // Intentionally not building state/systems yet — Task 3.2.
    void opts.settings;
    void opts.activePlayers;
  }

  /** Run one fixed-timestep tick. */
  fixedUpdate(_dt: number, _inputs?: ReadonlyMap<PlayerSlot, PlayerInput>): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** Get the current match state. Read-only from outside. */
  getState(): Readonly<MatchState> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** Get the (possibly mirrored) arena currently in use. */
  getArena(): Arena {
    return this._arena;
  }

  /** Get the seeded PRNG, if one was provided. */
  getRng(): SeededRNG | undefined {
    return this._rng;
  }

  /** Set the seeded PRNG (used by snapshot restore). */
  setRng(rng: SeededRNG): void {
    this._rng = rng;
  }

  /** Transition to a new phase. */
  setPhase(_phase: MatchPhase): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** Swap to a different arena in place. */
  switchArena(_arenaId: string): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** Mark a player as disconnected. */
  disconnectPlayer(_slot: PlayerSlot): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** Read the events bag (mostly for tests). */
  getEvents(): Readonly<SimulatorEvents> {
    return this._events;
  }
}
