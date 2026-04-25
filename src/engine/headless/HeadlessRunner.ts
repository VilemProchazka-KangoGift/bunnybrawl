import type { MatchState, PlayerSlot } from '../types';
import { isBotSlot } from '../types';
import { Simulator } from '../simulator/Simulator';
import type { ParticleEmitter } from '../simulator/types';
import { getArena } from '../arenas';
import { FIXED_TIMESTEP } from '../constants';
import { assignBotCharacters } from '../characters/defaults';
import type { CharacterSlot, BotSlot } from '../types';
import type { MatchResult, HeadlessRunnerConfig } from './types';

const NOOP_EMITTER: ParticleEmitter = {
  emitParticle: () => {},
  spawnCarrotVFX: () => {},
  applyHazardHitVFX: () => {},
};

/** Default budget: 5 minutes at 60Hz. */
const DEFAULT_MAX_TICKS = 18000;

/**
 * Drives a Simulator headlessly until matchOver or max-tick budget.
 *
 * Composition:
 *   - Owns: Simulator, tick counter, max-tick budget
 *   - Does NOT own: cosmetic systems, renderer, audio. Pure simulation.
 *
 * Typical flow:
 *   const runner = new HeadlessRunner(config);
 *   const result = runner.runMatch();
 *   // inspect result.winner, result.ticks, result.finalState, result.reason
 */
export class HeadlessRunner {
  private readonly _config: HeadlessRunnerConfig;
  private readonly _simulator: Simulator;
  private _ticks = 0;

  constructor(config: HeadlessRunnerConfig) {
    this._config = config;

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

    for (const [slot, input] of config.inputs) {
      this._simulator.setPlayerInput(slot, input);
    }
  }

  /** Run the simulation loop. Synchronous — blocks until termination. */
  runMatch(): MatchResult {
    // Transition into 'playing' so fixedUpdate doesn't early-return on phase.
    this._simulator.setPhase('playing');

    const maxTicks = this._config.maxTicks ?? DEFAULT_MAX_TICKS;
    while (this._ticks < maxTicks) {
      this._simulator.fixedUpdate(FIXED_TIMESTEP);
      this._ticks++;
      if (this._simulator.getState().matchOver) {
        return this._buildResult('match_over');
      }
    }
    return this._buildResult('max_ticks');
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
