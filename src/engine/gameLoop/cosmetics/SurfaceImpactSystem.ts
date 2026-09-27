import type { Arena, HazardZone, MatchState, Player, PlayerSlot } from '../../types';
import type { CosmeticSystem } from '../types';
import { getSlowDevice } from '../../perfFlags';
import {
  detectSurfaceImpact,
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

  /** Pre-filtered subset of arena.hazardZones containing only lava — the
   *  snapshot fn checks this every detect (5 slots × 30Hz), so paying the
   *  type-filter cost once at construction is the obvious move. Most arenas
   *  have zero lava zones; this lets those skip the inner loop entirely. */
  private readonly _lavaZones: readonly HazardZone[];
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
    p.inLava = this._isInLava(player);
    p.fastFalling = player.fastFalling;
    return p;
  };
  private _isInLava(player: Player): boolean {
    if (this._lavaZones.length === 0) return false;
    const cx = player.x + player.width / 2;
    const by = player.y + player.height;
    for (const hz of this._lavaZones) {
      if (cx >= hz.x && cx <= hz.x + hz.width && by >= hz.y && by <= hz.y + hz.height) return true;
    }
    return false;
  }
  /** Stable callback bound at construction; tracker passes `source` through. */
  private readonly _onSurfaceImpact = (prev: PrevSurfaceImpactState, player: Player): void => {
    detectSurfaceImpact(player, prev, this.state, this.arena, this._cb);
  };

  constructor(state: MatchState, arena: Arena) {
    this.state = state;
    this.arena = arena;
    this._lavaZones = arena.hazardZones?.filter((hz) => hz.type === 'lava') ?? [];
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

      this.tracker.detect(player.id, player, this._onSurfaceImpact);
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
