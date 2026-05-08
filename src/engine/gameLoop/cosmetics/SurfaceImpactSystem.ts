import type { Arena, MatchState, Player, PlayerSlot } from '../../types';
import type { CosmeticSystem } from '../types';
import { getSlowDevice } from '../../perfFlags';
import {
  detectSurfaceImpact,
  snapshotSurfaceImpactState,
  updateSurfaceLifetimes,
  type PrevSurfaceImpactState,
  type SurfaceImpactCallbacks,
} from './surfaceImpact';
import { TransitionTracker } from '../../transitionTracker';

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
  private readonly tracker: TransitionTracker<PlayerSlot, PrevSurfaceImpactState, Player>;
  private readonly _cb: SurfaceImpactCallbacks;

  constructor(state: MatchState, arena: Arena) {
    this.state = state;
    this.arena = arena;
    // Snapshot fn closes over `arena` — snapshotSurfaceImpactState reads
    // arena.hazardZones for lava-zone detection.
    this.tracker = new TransitionTracker<PlayerSlot, PrevSurfaceImpactState, Player>(
      (player) => snapshotSurfaceImpactState(player, this.arena),
    );
    this._cb = {
      isSlowDevice: () => getSlowDevice(),
    };
  }

  init(): void {
    for (const p of this.state.players) {
      this.tracker.prime(p.id, p);
    }
  }

  cosmeticUpdate(dt: number): void {
    updateSurfaceLifetimes(this.state, dt);

    for (const player of this.state.players) {
      if (!player.active) continue;

      this.tracker.detect(player.id, player, (prev) => {
        detectSurfaceImpact(player, prev, this.state, this.arena, this._cb);
      });
    }
  }

  /** Re-prime baselines (guest reconnect, loading→playing edge). switchArena
   *  rebuilds the system entirely so it doesn't go through here. */
  resetBaseline(): void {
    this.tracker.clear();
    for (const p of this.state.players) {
      this.tracker.prime(p.id, p);
    }
  }

  cleanup(): void {
    this.tracker.clear();
  }
}
