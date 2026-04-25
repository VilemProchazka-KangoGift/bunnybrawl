// @vitest-environment node
//
// Headless runner contract (Task 4.1). Drives a Simulator without any browser
// dependency. Coverage:
//   1. Construction is Node-safe (file env=node, no DOM/Howler/canvas mocks).
//   2. runMatch terminates with 'match_over' when killLimit reached.
//   3. runMatch terminates with 'max_ticks' when budget runs out.
//   4. Determinism: same seed + same inputs => identical end state.
//   5. Defensive: missing PlayerInput entries don't crash.
import { describe, it, expect, beforeAll } from 'vitest';
import { HeadlessRunner } from '../HeadlessRunner';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { SeededRNG } from '../../net/prng';
import { RandomInput } from '../../input/RandomInput';
import type { MatchSettings, PlayerSlot } from '../../types';
import type { PlayerInput } from '../../input/PlayerInput';
import type { HeadlessRunnerConfig } from '../types';

const BASE_MODS = {
  extremeGore: false,
  carrotChase: false,
  giantPlayers: false,
  turbo: false,
  superBounce: false,
  mirrorArena: false,
  underwaterGravity: false,
};

function makeSettings(overrides: Partial<MatchSettings> = {}): MatchSettings {
  return {
    killLimit: 16,
    timeLimit: 0,
    playerCount: 2,
    goreMode: false,
    arenaId: 'meadow',
    botCount: 0,
    botDifficulty: 'medium',
    mods: BASE_MODS,
    ...overrides,
  };
}

/** Build a fresh inputs map: each slot gets a deterministic RandomInput driven
 *  by a seed-derived RNG so two runs with the same seed produce identical
 *  input streams. */
function makeRandomInputs(slots: PlayerSlot[], seed: number): Map<PlayerSlot, PlayerInput> {
  const inputs = new Map<PlayerSlot, PlayerInput>();
  for (let i = 0; i < slots.length; i++) {
    // Per-slot input RNG (seed mixed with slot index) — keeps streams independent
    // but reproducible.
    const slotRng = new SeededRNG((seed ^ 0x52414e44) + i);
    inputs.set(slots[i], new RandomInput(slots[i], slotRng));
  }
  return inputs;
}

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

describe('HeadlessRunner (Task 4.1 — pure Node, no browser deps)', () => {
  it('constructs Node-safely with bots + seed and exposes the simulator', () => {
    const players: PlayerSlot[] = ['P1', 'P2', 'B1'];
    const config: HeadlessRunnerConfig = {
      arenaId: 'meadow',
      activePlayers: players,
      settings: makeSettings({ killLimit: 16, playerCount: 3, botCount: 1 }),
      rng: new SeededRNG(1),
      inputs: makeRandomInputs(players, 1),
    };
    const runner = new HeadlessRunner(config);

    expect(runner.getSimulator()).toBeDefined();
    expect(runner.getSimulator().getState().players).toHaveLength(3);
    expect(runner.getSimulator().getAIControllers().has('B1')).toBe(true);
    expect(runner.getTicks()).toBe(0);
  });

  it("terminates with reason='match_over' when killLimit is reached", () => {
    const players: PlayerSlot[] = ['P1', 'P2'];
    const config: HeadlessRunnerConfig = {
      arenaId: 'meadow',
      activePlayers: players,
      settings: makeSettings({ killLimit: 1, playerCount: 2, botCount: 0 }),
      rng: new SeededRNG(7),
      inputs: makeRandomInputs(players, 7),
      maxTicks: 600, // 10s — generous budget; test should end far sooner
    };
    const runner = new HeadlessRunner(config);

    // Force match end deterministically: skip countdown + set P1 over killLimit.
    // MatchSystem.fixedUpdate will see score >= killLimit and trigger onMatchEnd.
    const state = runner.getSimulator().getState();
    state.countdown = 0;
    state.players[0].score = 1;

    const result = runner.runMatch();

    expect(result.reason).toBe('match_over');
    expect(result.winner).toBe('P1');
    expect(result.ticks).toBeGreaterThan(0);
    expect(result.ticks).toBeLessThan(600);
    expect(result.finalState.matchOver).toBe(true);
  });

  it("terminates with reason='max_ticks' when budget runs out", () => {
    const players: PlayerSlot[] = ['P1', 'P2'];
    const config: HeadlessRunnerConfig = {
      arenaId: 'meadow',
      activePlayers: players,
      // killLimit unreachably high; no bots that score quickly. Inside the
      // 60-tick budget the simulator is still in countdown anyway, so no
      // gameplay events fire.
      settings: makeSettings({ killLimit: 999, playerCount: 2, botCount: 0 }),
      rng: new SeededRNG(11),
      inputs: makeRandomInputs(players, 11),
      maxTicks: 60,
    };
    const runner = new HeadlessRunner(config);

    const result = runner.runMatch();

    expect(result.reason).toBe('max_ticks');
    expect(result.ticks).toBe(60);
    expect(result.finalState.matchOver).toBe(false);
  });

  it('is deterministic: same seed + same inputs => identical end state', () => {
    const players: PlayerSlot[] = ['P1', 'P2'];
    const seed = 42;
    const buildConfig = (): HeadlessRunnerConfig => ({
      arenaId: 'meadow',
      activePlayers: players,
      settings: makeSettings({ killLimit: 999, playerCount: 2, botCount: 0 }),
      rng: new SeededRNG(seed),
      inputs: makeRandomInputs(players, seed),
      maxTicks: 300, // 5s
    });

    const a = new HeadlessRunner(buildConfig()).runMatch();
    const b = new HeadlessRunner(buildConfig()).runMatch();

    expect(a.ticks).toBe(b.ticks);
    expect(a.reason).toBe(b.reason);
    expect(a.winner).toBe(b.winner);

    const positionsA = a.finalState.players.map(p => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy }));
    const positionsB = b.finalState.players.map(p => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy }));
    expect(positionsB).toEqual(positionsA);

    const scoresA = a.finalState.players.map(p => ({ id: p.id, score: p.score }));
    const scoresB = b.finalState.players.map(p => ({ id: p.id, score: p.score }));
    expect(scoresB).toEqual(scoresA);
  });

  it('does not crash when activePlayers contains slots missing from inputs map', () => {
    const players: PlayerSlot[] = ['P1', 'P2'];
    const config: HeadlessRunnerConfig = {
      arenaId: 'meadow',
      activePlayers: players,
      settings: makeSettings({ killLimit: 999, playerCount: 2, botCount: 0 }),
      rng: new SeededRNG(3),
      inputs: new Map<PlayerSlot, PlayerInput>(), // no inputs registered
      maxTicks: 30,
    };
    const runner = new HeadlessRunner(config);

    expect(() => runner.runMatch()).not.toThrow();
    expect(runner.getTicks()).toBe(30);
  });
});
