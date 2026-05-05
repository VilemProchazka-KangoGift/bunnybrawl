import type { Arena, MatchState, PlayerSlot } from '../../types';
import type { CosmeticSystem } from '../types';
import type { ParticleSystem } from './ParticleSystem';
import { getSlowDevice } from '../../perfFlags';
import {
  detectSurfaceImpact,
  resetSurfaceImpactBaselines,
  snapshotSurfaceImpactState,
  updateSurfaceLifetimes,
  type PrevSurfaceImpactState,
  type SurfaceImpactCallbacks,
} from './surfaceImpact';

/**
 * Cosmetic system: surface-aware impact decals + liquid ripples + tagged
 * shockwaves. Driven by hard-landing transitions and lava-zone entry.
 *
 * Runs on host AND guest (cosmeticStep architecture). Decals are local-only;
 * minor jitter divergence is acceptable.
 */
export class SurfaceImpactSystem implements CosmeticSystem {
  private state: MatchState;
  private arena: Arena;
  private prev: Map<PlayerSlot, PrevSurfaceImpactState> = new Map();
  private readonly _cb: SurfaceImpactCallbacks;

  constructor(state: MatchState, arena: Arena, particleSystem: ParticleSystem) {
    this.state = state;
    this.arena = arena;
    this._cb = {
      isSlowDevice: () => getSlowDevice(),
      random: () => Math.random(),
      emitParticle: (x, y, vx, vy, life, size, color) => particleSystem.emitParticle(x, y, vx, vy, life, size, color),
    };
  }

  init(): void {
    for (const p of this.state.players) {
      this.prev.set(p.id, snapshotSurfaceImpactState(p, this.arena));
    }
  }

  cosmeticUpdate(dt: number): void {
    updateSurfaceLifetimes(this.state, dt);

    for (const player of this.state.players) {
      if (!player.active) continue;

      const prev = this.prev.get(player.id);
      if (prev) {
        detectSurfaceImpact(player, prev, this.state, this.arena, this._cb);
      } else {
        this.prev.set(player.id, snapshotSurfaceImpactState(player, this.arena));
      }
    }
  }

  /** Re-prime baselines (guest reconnect, loading→playing edge). switchArena
   *  rebuilds the system entirely so it doesn't go through here. */
  resetBaseline(): void {
    resetSurfaceImpactBaselines(this.state, this.arena, this.prev);
  }

  cleanup(): void {
    this.prev.clear();
  }
}
