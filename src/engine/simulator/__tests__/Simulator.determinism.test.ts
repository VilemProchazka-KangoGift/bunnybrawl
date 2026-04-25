// @vitest-environment node
//
// Standalone determinism contract for the pure Simulator core (Task 3.4).
//
// Distinct from `regression-determinism.test.ts`, which exercises the full
// `GameLoop` (with mocked audio + renderer + canvas). This test drives
// `Simulator` directly with no browser-bound dependencies — proving the pure
// core is deterministic and Node-safe by itself, and acts as the foundation
// for Phase 4's `HeadlessRunner`.
//
// If this snapshot diffs after a refactor, the pure Simulator's observable
// behavior changed. INVESTIGATE before regenerating.
import { describe, it, expect, beforeAll } from 'vitest';
import { Simulator } from '../Simulator';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { getArena } from '../../arenas';
import { SeededRNG } from '../../net/prng';
import { RuleBasedBot } from '../../input/RuleBasedBot';
import { RandomInput } from '../../input/RandomInput';
import { assignBotCharacters } from '../../characters/defaults';
import type { ParticleEmitter } from '../types';
import type { MatchSettings, MatchPhase, PlayerSlot, BotSlot, CharacterSlot } from '../../types';
import { isBotSlot } from '../../types';
import { FIXED_TIMESTEP } from '../../constants';

const NOOP_EMITTER: ParticleEmitter = {
  emitParticle: () => {},
  spawnCarrotVFX: () => {},
  applyHazardHitVFX: () => {},
};

const SETTINGS: MatchSettings = {
  killLimit: 16,
  timeLimit: 0,
  playerCount: 4,
  goreMode: false,
  arenaId: 'meadow',
  botCount: 2,
  botDifficulty: 'medium',
  mods: {
    extremeGore: false,
    carrotChase: false,
    giantPlayers: false,
    turbo: false,
    superBounce: false,
    mirrorArena: false,
    underwaterGravity: false,
  },
};

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

interface Fingerprint {
  kills: number;
  phase: MatchPhase;
  positions: Array<{ slot: PlayerSlot; x: number; y: number }>;
  scores: Array<{ slot: PlayerSlot; score: number }>;
}

/** Build + run a deterministic Simulator scenario and return a fingerprint of
 *  the end state. Same args → same fingerprint, by contract. */
function runScenario(opts: {
  seed: number;
  count: number;
  players: PlayerSlot[];
}): Fingerprint {
  const arena = getArena('meadow');
  // Game RNG (spawn order, hazards) — distinct from input randomness.
  const rng = new SeededRNG(opts.seed);
  // Input RNG fed to RandomInput (deterministic but separate stream so
  // input-derived randomness can't desync the spawn RNG state).
  const inputRng = new SeededRNG(opts.seed ^ 0x52414e44); // 'RAND' xor

  // Assign characters to bot slots before construction (Simulator's
  // createInitialPlayers reads from BOT_CHARACTERS for each bot slot).
  const humans = opts.players.filter((s): s is CharacterSlot => !isBotSlot(s));
  const bots = opts.players.filter((s): s is BotSlot => isBotSlot(s));
  if (bots.length > 0) assignBotCharacters(humans, bots, opts.seed);

  const sim = new Simulator({
    arena,
    settings: SETTINGS,
    activePlayers: opts.players,
    rng,
    particleEmitter: NOOP_EMITTER,
    events: {},
  });

  // Wire up PlayerInputs:
  //  - Bots → RuleBasedBot (driven by per-bot AIController already created
  //    by the Simulator constructor)
  //  - Humans → RandomInput with a separate seeded RNG
  for (const slot of opts.players) {
    if (isBotSlot(slot)) {
      const controller = sim.getAIControllers().get(slot);
      if (!controller) throw new Error(`No AIController for bot slot ${slot}`);
      sim.setPlayerInput(
        slot,
        new RuleBasedBot(slot as BotSlot, controller, sim.getArena(), SETTINGS.mods.carrotChase, SETTINGS.mods.mirrorArena),
      );
    } else {
      sim.setPlayerInput(slot, new RandomInput(slot, inputRng));
    }
  }

  // Flip phase to 'playing' — fixedUpdate early-returns during 'loading'.
  sim.setPhase('playing');

  for (let i = 0; i < opts.count; i++) {
    sim.fixedUpdate(FIXED_TIMESTEP);
  }

  const state = sim.getState();
  return {
    kills: state.killFeed.length,
    phase: state.phase,
    positions: state.players.map((p) => ({ slot: p.id, x: p.x, y: p.y })),
    scores: state.players.map((p) => ({ slot: p.id, score: p.score })),
  };
}

describe('Simulator determinism (Task 3.4 — standalone, no GameLoop)', () => {
  const SCENARIO = {
    seed: 42,
    count: 600, // 10s at 60Hz
    players: ['P1', 'P2', 'B1', 'B2'] as PlayerSlot[],
  };

  it('identical seed + inputs produce identical outcome (smoke)', () => {
    const a = runScenario(SCENARIO);
    const b = runScenario(SCENARIO);
    expect(b).toEqual(a);
  });

  it('locks the standalone Simulator fingerprint (refactor regression)', () => {
    const result = runScenario(SCENARIO);
    // Lock-in fixture: this snapshot is INDEPENDENT of the GameLoop-driven
    // determinism snapshot. If this fails, the pure Simulator's observable
    // behavior changed — investigate before regenerating.
    expect(result).toMatchSnapshot();
  });
});
