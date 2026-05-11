import type { Arena, MatchState, Player, PlayerSlot } from '../../types';
import type { CosmeticSystem } from '../types';
import { getSlowDevice } from '../../perfFlags';
import {
  detectSurfaceImpact,
  isInLavaZone,
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

  /** Per-slot pool of PrevSurfaceImpactState scratches — see PlayerTransitionSystem
   *  for the design rationale. Mutates in place instead of allocating per detect. */
  private readonly _scratchPrev: Map<PlayerSlot, PrevSurfaceImpactState> = new Map();
  private readonly _snapshotPooled = (player: Player): PrevSurfaceImpactState => {
    let p = this._scratchPrev.get(player.id);
    if (!p) {
      p = { state: 'idle', vy: 0, inLava: false, fastFalling: false };
      this._scratchPrev.set(player.id, p);
    }
    p.state = player.state;
    p.vy = player.vy;
    p.inLava = isInLavaZone(player, this.arena);
    p.fastFalling = player.fastFalling;
    return p;
  };
  /** Stable callback bound at construction; reads `_currentPlayer` instead of
   *  capturing per-iteration. */
  private _currentPlayer: Player | null = null;
  private readonly _onSurfaceImpact = (prev: PrevSurfaceImpactState): void => {
    const p = this._currentPlayer;
    if (p) detectSurfaceImpact(p, prev, this.state, this.arena, this._cb);
  };

  constructor(state: MatchState, arena: Arena) {
    this.state = state;
    this.arena = arena;
    this.tracker = new TransitionTracker<PlayerSlot, PrevSurfaceImpactState, Player>(this._snapshotPooled);
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

      this._currentPlayer = player;
      this.tracker.detect(player.id, player, this._onSurfaceImpact);
      this._currentPlayer = null;
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
