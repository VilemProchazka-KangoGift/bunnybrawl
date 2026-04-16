import type { MatchState, Arena, EffectZone, MatchSettings } from '../../types';
import type { GameplaySystem } from '../types';
import type { ParticleSystem } from '../cosmetics/ParticleSystem';
import { CARROT_SPAWN_INTERVAL, CARROT_CHASE_SPAWN_INTERVAL } from '../../constants';
import { spawnCarrot } from './carrots';

const f = Math.fround;

export class CarrotSystem implements GameplaySystem {
  private state: MatchState;
  private arena: Arena;
  private settings: MatchSettings;
  private cachedZeroGZones: readonly EffectZone[];
  private gameRandom: () => number;
  private particleSystem: ParticleSystem;

  constructor(
    state: MatchState,
    arena: Arena,
    settings: MatchSettings,
    cachedZeroGZones: readonly EffectZone[],
    gameRandom: () => number,
    particleSystem: ParticleSystem,
  ) {
    this.state = state;
    this.arena = arena;
    this.settings = settings;
    this.cachedZeroGZones = cachedZeroGZones;
    this.gameRandom = gameRandom;
    this.particleSystem = particleSystem;
  }

  init(): void {}

  fixedUpdate(dt: number): void {
    this.state.carrotTimer = f(this.state.carrotTimer - dt);
    if (this.state.carrotTimer <= 0) {
      const prevCount = this.state.carrots.length;
      spawnCarrot(this.state, this.arena, this.cachedZeroGZones, this.gameRandom);
      // Spawn VFX if a carrot was added
      if (this.state.carrots.length > prevCount) {
        const newCarrot = this.state.carrots[this.state.carrots.length - 1];
        this.particleSystem.spawnCarrotVFX(newCarrot.x, newCarrot.y);
      }
      this.state.carrotTimer = this.settings.mods.carrotChase ? CARROT_CHASE_SPAWN_INTERVAL : CARROT_SPAWN_INTERVAL;
    }
  }

  cleanup(): void {}
}
