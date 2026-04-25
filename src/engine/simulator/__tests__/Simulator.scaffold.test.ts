// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { Simulator } from '../Simulator';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { getArena } from '../../arenas';
import { SeededRNG } from '../../net/prng';
import type { MatchSettings, PlayerSlot, InputState } from '../../types';
import type { PlayerInput } from '../../input/PlayerInput';

const SETTINGS: MatchSettings = {
  killLimit: 16,
  timeLimit: 0,
  playerCount: 2,
  goreMode: false,
  arenaId: 'meadow',
  botCount: 0,
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

const PLAYERS: PlayerSlot[] = ['P1', 'P2'];

const IDLE_INPUT: InputState = { left: false, right: false, jump: false, down: false };

function makeStubInput(slot: PlayerSlot): PlayerInput {
  return {
    slot,
    getAction: () => IDLE_INPUT,
  };
}

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

describe('Simulator scaffold (Task 3.1)', () => {
  it('is importable in Node and constructs without throwing', () => {
    const arena = getArena('meadow');
    expect(() => new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS })).not.toThrow();
  });

  it('getArena returns the constructor arg', () => {
    const arena = getArena('meadow');
    const sim = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    expect(sim.getArena()).toBe(arena);
  });

  it('getRng returns the constructor arg, or undefined when omitted', () => {
    const arena = getArena('meadow');
    const rng = new SeededRNG(42);

    const withRng = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS, rng });
    expect(withRng.getRng()).toBe(rng);

    const withoutRng = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    expect(withoutRng.getRng()).toBeUndefined();
  });

  it('setRng updates the stored RNG', () => {
    const arena = getArena('meadow');
    const sim = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    expect(sim.getRng()).toBeUndefined();

    const rng = new SeededRNG(7);
    sim.setRng(rng);
    expect(sim.getRng()).toBe(rng);
  });

  it('constructs without error when events is omitted (no-op defaults are applied internally)', () => {
    const arena = getArena('meadow');
    expect(() => new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS })).not.toThrow();
    expect(() => new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS, events: {} })).not.toThrow();
  });

  it('getPhase returns "loading" on a fresh scaffold', () => {
    const arena = getArena('meadow');
    const sim = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    expect(sim.getPhase()).toBe('loading');
  });

  it('setPlayerInput stores a value retrievable via getPlayerInput', () => {
    const arena = getArena('meadow');
    const sim = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    const input = makeStubInput('P1');

    sim.setPlayerInput('P1', input);
    expect(sim.getPlayerInput('P1')).toBe(input);
  });

  it('getPlayerInput returns undefined for an unset slot', () => {
    const arena = getArena('meadow');
    const sim = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    expect(sim.getPlayerInput('P1')).toBeUndefined();
  });

  it('getPlayerInputs returns a Map containing registered entries', () => {
    const arena = getArena('meadow');
    const sim = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    const p1 = makeStubInput('P1');
    const p2 = makeStubInput('P2');

    sim.setPlayerInput('P1', p1);
    sim.setPlayerInput('P2', p2);

    const inputs = sim.getPlayerInputs();
    expect(inputs.size).toBe(2);
    expect(inputs.get('P1')).toBe(p1);
    expect(inputs.get('P2')).toBe(p2);
  });

  it('fixedUpdate throws NOT_IMPLEMENTED (scaffold has no behavior yet)', () => {
    const arena = getArena('meadow');
    const sim = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    expect(() => sim.fixedUpdate(1 / 60)).toThrow(/Task 3\.2/);
  });

  it('getState throws NOT_IMPLEMENTED (scaffold has no state yet)', () => {
    const arena = getArena('meadow');
    const sim = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    expect(() => sim.getState()).toThrow(/Task 3\.2/);
  });
});
