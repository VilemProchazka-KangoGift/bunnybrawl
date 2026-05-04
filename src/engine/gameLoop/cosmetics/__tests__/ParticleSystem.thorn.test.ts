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
    // Legacy: 18 blood + 8 shrapnel = 26. Current: 18 blood + 14 barbs + 1 drip = 33.
    expect(ps.getParticles().length).toBeGreaterThanOrEqual(33);
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

  it('emits all blood + barb particles as spikes for an elongated splatter read', () => {
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    const spikes = ps.getParticles().filter(p => p.shape === 'spike');
    // 18 blood (red) + 14 barb (brown) = 32. Drip stays a circle.
    expect(spikes.length).toBe(32);
    const barbs = spikes.filter(p => p.color === '#5C3A1E' || p.color === '#3A2210');
    expect(barbs.length).toBe(14);
  });
});
