import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MatchState } from '../../../types';
import { makeArena, makeSettings, makeState } from '../../../__tests__/testHelpers';
import type { HazardHitResult } from '../../gameplay/playerCollisions';

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

// Minimal theme — mirrors the pattern from systems.test.ts to avoid registry init
const mockTheme = {
  weather: { particleCount: 0, types: [] },
  wildlife: { count: 0, types: [] },
  fog: { count: 0 },
  ambientParticles: { count: 0 },
  dayNight: { enabled: false, cycleDuration: 120, showShootingStars: false },
  platform: { floatingBodyColor: '#888', groundTopColor: '#666' },
  ground: { surfaceColor: '#888888' },
  physics: {},
} as any;

describe('ParticleSystem.applyHazardHitVFX — thorn (rich-thorn batch C)', () => {
  let ps: ParticleSystem;
  let state: MatchState;
  const arena = makeArena();
  const settings = makeSettings();

  beforeEach(() => {
    state = makeState({ arena });
    state.phase = 'playing';
    ps = new ParticleSystem(state, arena, mockTheme, settings, new Map());
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
    const hit: HazardHitResult = { type: 'thorn', px: 100, py: 200, sx: 100, sy: 215, screenFlash: 0.1 };
    ps.applyHazardHitVFX(hit, 'P1', state, false);
    expect(state.screenFlash).toBeGreaterThanOrEqual(0.18);
  });
});
