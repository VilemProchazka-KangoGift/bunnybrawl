import type { MatchState, Arena, Player } from '../../types';
import type { GameplaySystem } from '../types';
import type { ParticleEmitter } from '../../simulator/types';
import {
  handleSpringCollision,
  handleThornCollision,
  handleHazardZoneCollision,
  handleGhostCollision,
  handleLavaRockCollision,
  handleFallOff,
} from './playerCollisions';

export class PlayerCollisionSystem implements GameplaySystem {
  private state: MatchState;
  private arena: Arena;
  private particleSystem: ParticleEmitter;
  private resimulatingGetter: () => boolean;

  constructor(
    state: MatchState,
    arena: Arena,
    particleSystem: ParticleEmitter,
    resimulatingGetter: () => boolean,
  ) {
    this.state = state;
    this.arena = arena;
    this.particleSystem = particleSystem;
    this.resimulatingGetter = resimulatingGetter;
  }

  init(): void {}

  checkCollisions(player: Player): void {
    const resimulating = this.resimulatingGetter();

    const springHit = handleSpringCollision(player, this.state);
    if (springHit) this.particleSystem.applyHazardHitVFX(springHit, player.id, this.state, resimulating);

    const thornHit = handleThornCollision(player, this.state);
    if (thornHit) this.particleSystem.applyHazardHitVFX(thornHit, player.id, this.state, resimulating);

    const hzHit = handleHazardZoneCollision(player, this.arena);
    if (hzHit) this.particleSystem.applyHazardHitVFX(hzHit, player.id, this.state, resimulating);

    const ghostHit = handleGhostCollision(player, this.state);
    if (ghostHit) this.particleSystem.applyHazardHitVFX(ghostHit, player.id, this.state, resimulating);

    const rockHit = handleLavaRockCollision(player, this.state);
    if (rockHit) this.particleSystem.applyHazardHitVFX(rockHit, player.id, this.state, resimulating);

    const fell = handleFallOff(player, this.arena, this.state);
    if (fell) this.particleSystem.applyHazardHitVFX(fell, player.id, this.state, resimulating);
  }

  fixedUpdate(_dt: number): void {}

  cleanup(): void {}
}
