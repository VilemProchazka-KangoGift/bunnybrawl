import type { MatchState, MatchPhase, MatchSettings, Arena, PlayerSlot } from '../types';
import type { SeededRNG } from '../net/prng';
import type { PlayerInput } from '../input/PlayerInput';
import type { SimulatorEvents, SimulatorOptions } from './types';

const NOT_IMPLEMENTED = 'Simulator: implementation lands in Task 3.2.';

const NOOP = (): void => {};
const NOOP_NAME = (_n: string): void => {};
const NOOP_PHASE = (_p: MatchPhase): void => {};
const NOOP_MATCH_END = (_w: PlayerSlot | null, _s: MatchState): void => {};

/**
 * Pure simulation core — Node-safe. No browser, no DOM, no audio imports.
 * Side effects flow through SimulatorEvents (audio, phase change, match end).
 *
 * This file is a SCAFFOLD (Task 3.1). The constructor stores args; most methods
 * throw or return safe defaults. Real wiring happens in Task 3.2 when state +
 * RNG + gameplay systems migrate from GameLoop.
 */
export class Simulator {
  private readonly _arena: Arena;
  private readonly _settings: MatchSettings;
  private readonly _activePlayers: readonly PlayerSlot[];
  private readonly _events: Required<SimulatorEvents>;
  private _rng?: SeededRNG;
  private _phase: MatchPhase = 'loading';
  private _playerInputs: Map<PlayerSlot, PlayerInput> = new Map();

  constructor(opts: SimulatorOptions) {
    this._arena = opts.arena;
    this._settings = opts.settings;
    this._activePlayers = opts.activePlayers;
    const e = opts.events ?? {};
    this._events = {
      onSfxRequest: e.onSfxRequest ?? NOOP_NAME,
      onAnimalSfxRequest: e.onAnimalSfxRequest ?? NOOP_NAME,
      onMusicStartRequest: e.onMusicStartRequest ?? NOOP_NAME,
      onMusicStopRequest: e.onMusicStopRequest ?? NOOP,
      onAllGameSoundsStopRequest: e.onAllGameSoundsStopRequest ?? NOOP,
      onPhaseChange: e.onPhaseChange ?? NOOP_PHASE,
      onMatchEnd: e.onMatchEnd ?? NOOP_MATCH_END,
    };
    this._rng = opts.rng;
    // Scaffold: fields stored for Task 3.2 wiring. Reference to satisfy noUnusedLocals.
    void this._settings;
    void this._activePlayers;
    void this._events;
  }

  /** Run one fixed-timestep tick. */
  fixedUpdate(_dt: number): void {
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

  /** Get the current match phase. */
  getPhase(): MatchPhase {
    return this._phase;
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

  /** Register a PlayerInput for a slot. Replaces any existing entry. */
  setPlayerInput(slot: PlayerSlot, input: PlayerInput): void {
    this._playerInputs.set(slot, input);
  }

  /** Get the registered PlayerInput for a slot, if any. */
  getPlayerInput(slot: PlayerSlot): PlayerInput | undefined {
    return this._playerInputs.get(slot);
  }

  /** Read-only view of the PlayerInput map (mainly for adapters that need to enumerate). */
  getPlayerInputs(): ReadonlyMap<PlayerSlot, PlayerInput> {
    return this._playerInputs;
  }
}
