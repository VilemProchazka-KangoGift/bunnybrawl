import type { InputState, MatchState, PlayerSlot } from '../types';
import { isBotSlot } from '../types';
import { Simulator } from '../simulator/Simulator';
import type { ParticleEmitter } from '../simulator/types';
import { getArena } from '../arenas';
import { FIXED_TIMESTEP } from '../constants';
import { assignBotCharacters } from '../characters/defaults';
import type { CharacterSlot, BotSlot } from '../types';
import type { PlayerInput } from '../input/PlayerInput';
import type { MatchResult, HeadlessRunnerConfig, RecordingConfig } from './types';
import { extractObservation, OBSERVATION_SIZE } from './observation';

const NOOP_EMITTER: ParticleEmitter = {
  emitParticle: () => {},
  spawnCarrotVFX: () => {},
  applyHazardHitVFX: () => {},
};

const ALL_FALSE_INPUT: Readonly<InputState> = {
  left: false,
  right: false,
  jump: false,
  down: false,
};

/** Default budget: 5 minutes at 60Hz. */
const DEFAULT_MAX_TICKS = 18000;

/**
 * Wraps a PlayerInput so the runner can read the action it returned each tick.
 * Behavior is purely additive — the Simulator sees the same action it would
 * have without the wrapper. Used only when recording is enabled.
 */
class ActionCapturingInput implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly _inner: PlayerInput;
  /** Last action returned. Mutated each getAction() call; cloned on read by the runner. */
  lastAction: InputState = { ...ALL_FALSE_INPUT };

  constructor(slot: PlayerSlot, inner: PlayerInput) {
    this.slot = slot;
    this._inner = inner;
  }

  getAction(state: Readonly<MatchState>): InputState {
    const action = this._inner.getAction(state);
    this.lastAction.left = action.left;
    this.lastAction.right = action.right;
    this.lastAction.jump = action.jump;
    this.lastAction.down = action.down;
    return action;
  }
}

/**
 * Drives a Simulator headlessly until matchOver or max-tick budget.
 *
 * Composition:
 *   - Owns: Simulator, tick counter, max-tick budget, optional recording state
 *   - Does NOT own: cosmetic systems, renderer, audio. Pure simulation.
 *
 * Typical flow:
 *   const runner = new HeadlessRunner(config);
 *   const result = runner.runMatch();
 *   await config.recording?.recorder.flush();  // if recording
 */
export class HeadlessRunner {
  private readonly _config: HeadlessRunnerConfig;
  private readonly _simulator: Simulator;
  private readonly _recording: RecordingConfig | null;
  private readonly _capturingWrappers: Map<PlayerSlot, ActionCapturingInput> = new Map();
  /** Pre-tick observation buffers — one per recorded slot, reused per tick. */
  private readonly _obsBuffers: Map<PlayerSlot, Float32Array> = new Map();
  /** Pre-tick observation snapshots (cloned to plain arrays for the recorder). */
  private readonly _obsSnapshots: Map<PlayerSlot, number[]> = new Map();
  private _ticks = 0;
  private _consumed = false;

  constructor(config: HeadlessRunnerConfig) {
    this._config = config;
    this._recording = config.recording ?? null;

    // Bot character assignment must run before Simulator construction —
    // createInitialPlayers reads from BOT_CHARACTERS for each bot slot.
    const humans = config.activePlayers.filter((s): s is CharacterSlot => !isBotSlot(s));
    const bots = config.activePlayers.filter((s): s is BotSlot => isBotSlot(s));
    if (bots.length > 0) {
      const seed = config.rng?.getState() ?? 0;
      assignBotCharacters(humans, bots, seed);
    }

    this._simulator = new Simulator({
      arena: getArena(config.arenaId),
      settings: config.settings,
      activePlayers: config.activePlayers,
      rng: config.rng,
      particleEmitter: config.particleEmitter ?? NOOP_EMITTER,
      // No events — sounds/phase callbacks ignored in headless mode.
    });

    // Register PlayerInputs. If recording, wrap recorded-slot inputs to
    // capture the action each tick.
    const recordedSet = new Set(this._recording?.slots ?? []);
    for (const [slot, input] of config.inputs) {
      if (recordedSet.has(slot)) {
        const wrapper = new ActionCapturingInput(slot, input);
        this._capturingWrappers.set(slot, wrapper);
        this._simulator.setPlayerInput(slot, wrapper);
      } else {
        this._simulator.setPlayerInput(slot, input);
      }
    }

    if (this._recording) {
      for (const slot of this._recording.slots) {
        this._obsBuffers.set(slot, new Float32Array(OBSERVATION_SIZE));
        this._obsSnapshots.set(slot, new Array(OBSERVATION_SIZE).fill(0));
      }
    }
  }

  /**
   * Run the simulation loop. Synchronous — blocks until termination.
   * If a recorder is configured, it receives begin() before the first tick
   * and end() after the loop terminates. flush() is the caller's job (await it).
   *
   * Single-shot — construct a fresh runner per episode. Calling twice would
   * write two header lines into the same recorder and resume from a terminal
   * state; the guard below makes the misuse explicit.
   */
  runMatch(): MatchResult {
    if (this._consumed) {
      throw new Error(
        'HeadlessRunner.runMatch() is single-shot. Construct a new HeadlessRunner per episode.',
      );
    }
    this._consumed = true;
    if (this._recording) {
      this._recording.recorder.begin({
        arenaId: this._config.arenaId,
        seed: this._config.rng?.getState(),
        activePlayers: this._config.activePlayers,
        startedAt: Date.now(),
        tags: this._recording.tags,
      });
    }

    // Transition into 'playing' so fixedUpdate doesn't early-return on phase.
    this._simulator.setPhase('playing');

    const maxTicks = this._config.maxTicks ?? DEFAULT_MAX_TICKS;
    let result: MatchResult | null = null;
    while (this._ticks < maxTicks) {
      this._snapshotObservations();
      this._simulator.fixedUpdate(FIXED_TIMESTEP);
      this._ticks++;
      const matchOver = this._simulator.getState().matchOver;
      const done = matchOver || this._ticks >= maxTicks;
      this._recordTick(done);
      if (matchOver) {
        result = this._buildResult('match_over');
        break;
      }
    }
    if (!result) result = this._buildResult('max_ticks');

    if (this._recording) this._recording.recorder.end(result);
    return result;
  }

  /** Number of ticks consumed so far. */
  getTicks(): number {
    return this._ticks;
  }

  /** Underlying simulator (for inspection / advanced use cases such as
   *  post-construction PlayerInput wiring for RuleBasedBot). */
  getSimulator(): Simulator {
    return this._simulator;
  }

  /** Snapshot pre-tick observations for each recorded slot. Called BEFORE fixedUpdate. */
  private _snapshotObservations(): void {
    if (!this._recording) return;
    const state = this._simulator.getState();
    const arena = this._simulator.getArena();
    for (const slot of this._recording.slots) {
      const buf = this._obsBuffers.get(slot)!;
      extractObservation(state, slot, arena, this._config.settings, buf);
      const snap = this._obsSnapshots.get(slot)!;
      for (let i = 0; i < OBSERVATION_SIZE; i++) snap[i] = buf[i];
    }
  }

  /** Emit one Sample per recorded slot to the recorder. Called AFTER fixedUpdate. */
  private _recordTick(done: boolean): void {
    if (!this._recording) return;
    const state = this._simulator.getState();
    const tickIndex = this._ticks - 1; // _ticks was just incremented
    for (const slot of this._recording.slots) {
      const wrapper = this._capturingWrappers.get(slot);
      const action = wrapper
        ? { ...wrapper.lastAction }
        : { ...ALL_FALSE_INPUT };
      const reward = this._recording.rewardShapers?.get(slot)?.observe(state) ?? 0;
      // Snapshot was filled into _obsSnapshots[slot] pre-tick; clone for the sink.
      const snap = this._obsSnapshots.get(slot)!;
      this._recording.recorder.record({
        tick: tickIndex,
        slot,
        obs: snap.slice(), // clone — sink may retain references
        action,
        reward,
        done,
      });
    }
  }

  private _buildResult(reason: 'match_over' | 'max_ticks'): MatchResult {
    const state = this._simulator.getState();
    return {
      winner: this._inferWinner(state),
      ticks: this._ticks,
      reason,
      finalState: state,
    };
  }

  /** Determine the winner from a terminated match state.
   *
   *  - If MatchSystem flipped `state.winner` (kill limit / time limit / lone
   *    survivor / all-disconnected), trust it.
   *  - Otherwise (max-tick exhaustion), pick the highest-scoring still-active
   *    non-disconnected player. Ties broken by player array order. Returns
   *    null only if no active non-disconnected player exists. */
  private _inferWinner(state: MatchState): PlayerSlot | null {
    if (state.winner !== null) return state.winner;
    let best: PlayerSlot | null = null;
    let bestScore = -Infinity;
    for (const p of state.players) {
      if (!p.active || p.disconnected) continue;
      if (p.score > bestScore) {
        bestScore = p.score;
        best = p.id;
      }
    }
    return best;
  }
}
