import type { MatchState, PlayerSlot } from '../../types';
import type { CosmeticSystem } from '../types';
import type { ParticleSystem } from './ParticleSystem';
import { updatePlayerCosmetics } from './playerCosmetics';

export class PlayerCosmeticSystem implements CosmeticSystem {
  private state: MatchState;
  private effWalkSpeed: number;
  private particleSystem: ParticleSystem;
  private playSound: (name: string) => void;

  private afterimageAccumulators: Map<PlayerSlot, number> = new Map();
  private footstepAccumulators: Map<PlayerSlot, number> = new Map();

  constructor(
    state: MatchState,
    effWalkSpeed: number,
    particleSystem: ParticleSystem,
    playSound: (name: string) => void,
  ) {
    this.state = state;
    this.effWalkSpeed = effWalkSpeed;
    this.particleSystem = particleSystem;
    this.playSound = playSound;
  }

  init(): void {}

  cosmeticUpdate(dt: number): void {
    for (const player of this.state.players) {
      if (!player.active) continue;

      // Skip during hitstop (player is frozen)
      if (player.hitstopTimer > 0) continue;

      updatePlayerCosmetics(
        player, dt, this.state.timeElapsed, this.effWalkSpeed,
        this.afterimageAccumulators, this.footstepAccumulators,
        (x, y, vx, vy, life, size, color) => this.particleSystem.emitParticle(x, y, vx, vy, life, size, color),
        this.playSound,
      );
    }
  }

  cleanup(): void {
    this.afterimageAccumulators.clear();
    this.footstepAccumulators.clear();
  }
}
