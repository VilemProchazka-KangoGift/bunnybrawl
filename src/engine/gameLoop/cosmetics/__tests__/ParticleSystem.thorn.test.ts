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

  it('emits more particles than the legacy thorn case', () => {
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    // Legacy: 18 blood + 8 shrapnel = 26. New: 18 blood + 12 barbs + 1 drip = 31.
    expect(ps.getParticles().length).toBeGreaterThanOrEqual(31);
  });

  it('emits at least one long-lived drip particle near the contact point', () => {
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    const dripCandidates = ps.getParticles().filter(p =>
      Math.abs(p.x - 100) < 6 &&
      Math.abs(p.y - 215) < 6 &&
      p.life > 0.7
    );
    expect(dripCandidates.length).toBeGreaterThanOrEqual(1);
  });

  it('boosts screen flash to at least 0.18', () => {
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    expect(state.screenFlash).toBeGreaterThanOrEqual(0.18);
  });

  it('emits 12 barb fragments with shape: spike', () => {
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    const spikes = ps.getParticles().filter(p => p.shape === 'spike');
    expect(spikes.length).toBe(12);
  });
});
