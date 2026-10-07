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
  private movementScale: number;

  constructor(
    state: MatchState,
    arena: Arena,
    particleSystem: ParticleEmitter,
    resimulatingGetter: () => boolean,
    movementScale = 1,
  ) {
    this.state = state;
    this.arena = arena;
    this.particleSystem = particleSystem;
    this.resimulatingGetter = resimulatingGetter;
    this.movementScale = movementScale;
  }

  init(): void {}

  checkCollisions(player: Player): void {
    const resimulating = this.resimulatingGetter();

    const springHit = handleSpringCollision(player, this.state, this.movementScale);
    if (springHit) this.particleSystem.applyHazardHitVFX(springHit, player.id, this.state, resimulating);

    const thornHit = handleThornCollision(player, this.state);
    if (thornHit) this.particleSystem.applyHazardHitVFX(thornHit, player.id, this.state, resimulating);

    const hzHit = handleHazardZoneCollision(player, this.arena, this.movementScale);
    if (hzHit) this.particleSystem.applyHazardHitVFX(hzHit, player.id, this.state, resimulating);

    const ghostHit = handleGhostCollision(player, this.state, this.movementScale);
    if (ghostHit) this.particleSystem.applyHazardHitVFX(ghostHit, player.id, this.state, resimulating);

    const rockHit = handleLavaRockCollision(player, this.state, this.movementScale);
    if (rockHit) this.particleSystem.applyHazardHitVFX(rockHit, player.id, this.state, resimulating);

    const fell = handleFallOff(player, this.arena, this.state);
    if (fell) this.particleSystem.applyHazardHitVFX(fell, player.id, this.state, resimulating);
  }

  fixedUpdate(_dt: number): void {}

  cleanup(): void {}
}
