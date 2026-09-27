// src/engine/gameLoop/cosmetics/WildlifeSystem.ts
import type { Arena, MatchState } from '../../types';
import type { CosmeticSystem } from '../types';
import { getSlowDevice } from '../../perfFlags';
import {
  getWildlifeKind,
  type WildlifeInstance,
  type WildlifeLayer,
} from './wildlife';

/**
 * Cosmetic system: ambient wildlife (snails, crabs, rats, gumdrops, robots,
 * squirrels…). Mirrors the structure of `ReactiveDecorationSystem` — kind
 * registry + per-instance data bag + factory + system orchestration.
 *
 * Instances are populated via `ArenaPack.buildWildlife(arena)` at arena-load
 * time. Each instance carries a registered kindId; the system iterates them
 * in `cosmeticUpdate` (calling `kind.tick`) and exposes per-layer arrays for
 * the renderer (which calls `kind.draw` at the appropriate slot).
 *
 * Layer semantics:
 *  - `groundCritter`: between fog and fg-nature, so foliage occludes critters
 *    walking behind it.
 *  - `animBackground`: `drawAnimatedBackground` slot (early bg pass, behind
 *    clouds), used by the treetops squirrel.
 *
 * `slow-device` is honoured: the system skips its tick + draw entirely when
 * the slow flag is set — wildlife disappears on slow devices across ALL
 * arenas. Pre-migration this was inconsistent (5 packs slow-gated; castle
 * and space-station did not); the migration unifies behavior. If a future
 * arena needs an opt-out, add a `slowDeviceVisible: true` flag to the
 * `WildlifeKind` config and gate accordingly.
 */
export class WildlifeSystem implements CosmeticSystem {
  private state: MatchState;
  private arena: Arena;

  /** All instances, regardless of layer — single tick pass uses this. */
  private _instances: WildlifeInstance[] = [];
  /** Pre-bucketed per-layer for the renderer. Stable references rebuilt only
   *  on `setInstances`, so no per-frame allocation. */
  private _drawGround: WildlifeInstance[] = [];
  private _drawAnimBg: WildlifeInstance[] = [];

  constructor(state: MatchState, arena: Arena) {
    this.state = state;
    this.arena = arena;
  }

  init(): void {
    // No-op: instances are populated via setInstances() at arena-load time.
  }

  /** Replace the instance list. Pre-buckets by render layer. Unknown kinds
   *  (no registration) are dropped with a warning — same contract as
   *  ReactiveDecorationSystem. */
  setInstances(instances: WildlifeInstance[]): void {
    this._instances = [];
    this._drawGround.length = 0;
    this._drawAnimBg.length = 0;
    for (const inst of instances) {
      const cfg = getWildlifeKind(inst.kindId);
      if (!cfg) {
        console.warn(`[WildlifeSystem] unknown kind '${inst.kindId}'`);
        continue;
      }
      this._instances.push(inst);
      if (cfg.layer === 'animBackground') this._drawAnimBg.push(inst);
      else this._drawGround.push(inst);
    }
  }

  /** Layer-bucketed instances for Renderer use. No per-frame allocation. */
  getInstancesForLayer(layer: WildlifeLayer): ReadonlyArray<WildlifeInstance> {
    return layer === 'animBackground' ? this._drawAnimBg : this._drawGround;
  }

  /** 30Hz tick. Called from GameLoop.cosmeticStep. Advances every instance's
   *  per-kind state via the registered tick fn. */
  cosmeticUpdate(dt: number): void {
    if (getSlowDevice()) return;
    if (this._instances.length === 0) return;
    if (this.state.phase === 'loading') return;
    const players = this.state.players;
    const arena = this.arena;
    for (let i = 0; i < this._instances.length; i++) {
      const inst = this._instances[i];
      const cfg = getWildlifeKind(inst.kindId);
      if (!cfg) continue;
      cfg.tick(inst, dt, players, arena);
    }
  }

  /** Re-prime per-instance state via the kind's `resetData` hook. Used on
   *  guest reconnect or loading→playing edge so kinds with mutable state
   *  don't carry over stale runtime motion. */
  resetBaseline(): void {
    for (let i = 0; i < this._instances.length; i++) {
      const inst = this._instances[i];
      const cfg = getWildlifeKind(inst.kindId);
      if (cfg?.resetData) cfg.resetData(inst.data);
    }
  }

  cleanup(): void {
    this._instances = [];
    this._drawGround.length = 0;
    this._drawAnimBg.length = 0;
  }
}
