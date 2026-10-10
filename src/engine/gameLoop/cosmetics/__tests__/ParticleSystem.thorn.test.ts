import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { MatchState } from '../../../types';
import { makeArena, makeSettings, makeState } from '../../../__tests__/testHelpers';
import type { HazardHitResult } from '../../gameplay/playerCollisions';
import { getTheme, registerBuiltinArenas } from '../../../arenas';

vi.mock('../../../audio', () => ({
  audio: {
    play: vi.fn(), stop: vi.fn(), setVolume: vi.fn(),
    playAnimal: vi.fn(), stopAllGameSounds: vi.fn(),
  },
}));
vi.mock('../../../haptics', () => ({
  haptics: {
    isLocal: () => false, init: vi.fn(), bump: vi.fn(),
    hazardHit: vi.fn(), spring: vi.fn(), hitstop: vi.fn(), landing: vi.fn(),
  },
}));

import { ParticleSystem } from '../ParticleSystem';

beforeAll(() => {
  registerBuiltinArenas();
});

describe('ParticleSystem.applyHazardHitVFX — thorn', () => {
  let ps: ParticleSystem;
  let state: MatchState;
  const arena = makeArena();
  const settings = makeSettings();

  beforeEach(() => {
    const theme = getTheme('meadow');
    state = makeState({ arena });
    state.phase = 'playing';
    ps = new ParticleSystem(state, arena, theme, settings, new Map());
  });

  it('emits one anchored cartoon impact instead of blood and drip particles', () => {
    const hit: HazardHitResult = {type:'thorn',px:100,py:200,sx:100,sy:215};
    ps.applyHazardHitVFX(hit,'P1',state,false);
    expect(ps.getParticles()).toHaveLength(1);
    expect(ps.getParticles()[0]).toMatchObject({shape:'thornJolt',x:100,y:200,vx:0,vy:0,life:.48,maxLife:.48});
  });

  it('keeps the impact stationary during its lifetime and then removes it', async () => {
    const {updateParticles} = await import('../particles');
    ps.applyHazardHitVFX({type:'thorn',px:100,py:200},'P1',state,false);
    const particles=ps.getParticles();
    updateParticles(particles,[],arena.platforms,true,[],.1);
    expect(particles[0]).toMatchObject({x:100,y:200,vx:0,vy:0});
    updateParticles(particles,[],arena.platforms,true,[],.5);
    expect(particles).toHaveLength(0);
  });

  it('does not add a screen flash on thorn contact', () => {
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    expect(state.screenFlash).toBe(0);
  });

  it('does not add a new screen flash while replaying a hit', () => {
    state.screenFlash=0;
    ps.applyHazardHitVFX({type:'thorn',px:100,py:200},'P1',state,true);
    expect(state.screenFlash).toBe(0);
  });

});
