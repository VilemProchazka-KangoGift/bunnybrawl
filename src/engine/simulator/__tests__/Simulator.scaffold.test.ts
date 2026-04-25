// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { Simulator } from '../Simulator';
import type { SimulatorEvents } from '../types';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { getArena } from '../../arenas';
import { SeededRNG } from '../../net/prng';
import type { MatchSettings, PlayerSlot } from '../../types';

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

  it('getEvents returns the constructor events (or empty object when omitted)', () => {
    const arena = getArena('meadow');
    const events: SimulatorEvents = {
      onSfxRequest: () => {},
      onAnimalSfxRequest: () => {},
      onPhaseChange: () => {},
      onMatchEnd: () => {},
    };

    const withEvents = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS, events });
    expect(withEvents.getEvents()).toBe(events);

    const withoutEvents = new Simulator({ arena, settings: SETTINGS, activePlayers: PLAYERS });
    expect(withoutEvents.getEvents()).toEqual({});
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
