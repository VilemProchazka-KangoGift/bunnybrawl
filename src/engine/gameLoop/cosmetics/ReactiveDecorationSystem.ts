// src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts
import type { Arena, MatchState } from '../../types';
import type { CosmeticSystem } from '../types';
import { getSlowDevice } from '../../perfFlags';
import {
  applyShakeImpulse, decayShake, getReactiveKind, updateExcitement,
  type ReactiveInstance, type ReactiveLayer,
} from './reactiveDecorations';

/** Wind oscillator angular speed (rad/s). One cycle ≈ 10s. */
const WIND_SPEED = 0.6;

/** Burst emitter callback signature. The system calls this when a burst fires;
 *  GameLoop wires it to a thin wrapper that spawns particles via ParticleSystem. */
export type BurstEmitter = (
  instance: ReactiveInstance,
  arena: Arena,
) => void;

/**
 * Cosmetic system: arena-anchored decorations with wind sway, proximity
 * response, stomp shake, and burst triggers. Update split into 30Hz (default)
 * and 60Hz (per-kind opt-in) buckets so fast-moving creatures stay smooth.
 *
 * Renders in two slots — pre-player and post-player — to preserve the existing
 * z-ordering of butterflies/bees vs trees/dandelions. Instances are pre-bucketed
 * by both update frequency AND render layer, so the renderer iterates one
 * already-filtered list per layer with no per-frame allocation or layer
 * filtering.
 */
export class ReactiveDecorationSystem implements CosmeticSystem {
  private state: MatchState;
  private arena: Arena;
  private burstEmit: BurstEmitter;

  /** Update buckets — drive `_tickBucket` at the kind's chosen frequency. */
  private _tick30: ReactiveInstance[] = [];
  private _tick60: ReactiveInstance[] = [];
  /** Render buckets — concatenated by layer, exposed read-only to the renderer.
   *  Combines 30Hz + 60Hz instances of the same layer in one stable array, so
   *  per-frame consumers don't allocate or filter. */
  private _drawPre: ReactiveInstance[] = [];
  private _drawPost: ReactiveInstance[] = [];
  private _windPhase = 0;

  constructor(state: MatchState, arena: Arena, burstEmit: BurstEmitter) {
    this.state = state;
    this.arena = arena;
    this.burstEmit = burstEmit;
  }

  init(): void {
    // No-op: instances are populated via setInstances() at arena-load time.
  }

  /** Replace the instance list. Pre-buckets by both render layer AND update
   *  frequency. Unknown kinds (no registration) are dropped with a warning. */
  setInstances(instances: ReactiveInstance[]): void {
    this._tick30.length = 0;
    this._tick60.length = 0;
    this._drawPre.length = 0;
    this._drawPost.length = 0;
    for (const inst of instances) {
      const cfg = getReactiveKind(inst.kind);
      if (!cfg) {
        console.warn(`[ReactiveDecorationSystem] unknown kind '${inst.kind}'`);
        continue;
      }
      if (cfg.highFrequency) this._tick60.push(inst);
      else this._tick30.push(inst);
      if (cfg.layer === 'postPlayer') this._drawPost.push(inst);
      else this._drawPre.push(inst);
    }
  }

  /** Layer-bucketed instances for Renderer use. No per-frame allocation —
   *  these arrays are stable references rebuilt only on `setInstances`. */
  getInstancesForLayer(layer: ReactiveLayer): ReadonlyArray<ReactiveInstance> {
    return layer === 'postPlayer' ? this._drawPost : this._drawPre;
  }
  /** Current wind oscillator phase. For Renderer (passed to draw fns). */
  getWindPhase(): number { return this._windPhase; }

  /** 60Hz tick. Called from GameLoop.fixedUpdate. Advances windPhase and runs
   *  the 60Hz bucket — both skipped during loading so trees start at sway=0
   *  and butterflies/bees don't accumulate excitement against off-screen
   *  players the moment the match begins. (Mirrors the 30Hz bucket, which is
   *  loading-gated by `cosmeticStep` early-returning in GameLoop.) */
  fixedUpdate(dt: number): void {
    if (this.state.phase === 'loading') return;
    this._windPhase += WIND_SPEED * dt;
    if (this._tick60.length > 0) this._tickBucket(this._tick60, dt);
  }

  /** 30Hz tick. Called from GameLoop.cosmeticStep. Runs the 30Hz instance bucket. */
  cosmeticUpdate(dt: number): void {
    if (this._tick30.length > 0) this._tickBucket(this._tick30, dt);
  }

  /** Apply a stomp impulse to all instances within their shakeRadius. Fires
   *  bursts immediately for any instance whose shakeDecay crosses its burst
   *  threshold on the rising edge.
   *
   *  Safe by construction during host-authority resimulation: the only call
   *  site is `PlayerTransitionSystem.cosmeticUpdate`, which runs from
   *  `cosmeticStep` — and `cosmeticStep` is never called during resim
   *  (gameplay re-runs go through `Simulator.fixedUpdate` only). Pinned by
   *  the resimulation-safety test in `__tests__/ReactiveDecorationSystem`. */
  applyStompImpulse(stompX: number, stompY: number): void {
    this._applyImpulseToBucket(this._tick30, stompX, stompY);
    this._applyImpulseToBucket(this._tick60, stompX, stompY);
  }

  /** Re-prime per-instance state (zeros excitement / shakeDecay / nearestDx
   *  and invokes the kind's `resetData` if registered). Used on guest reconnect
   *  or loading→playing edge to avoid stale carryover — without it, dandelions
   *  reconnecting mid-burst would resume with a half-grown puff. Does NOT
   *  reset windPhase — that stays continuous so wind doesn't visually snap. */
  resetBaseline(): void {
    this._resetBucket(this._tick30);
    this._resetBucket(this._tick60);
  }

  private _resetBucket(bucket: ReactiveInstance[]): void {
    for (let i = 0; i < bucket.length; i++) {
      const inst = bucket[i];
      inst.excitement = 0;
      inst.shakeDecay = 0;
      inst.nearestDx = undefined;
      if (inst.data !== undefined) {
        const cfg = getReactiveKind(inst.kind);
        if (cfg?.resetData) cfg.resetData(inst.data);
      }
    }
  }

  cleanup(): void {
    this._tick30.length = 0;
    this._tick60.length = 0;
    this._drawPre.length = 0;
    this._drawPost.length = 0;
    this._windPhase = 0;
  }

  // ---- internals ----

  private _applyImpulseToBucket(bucket: ReactiveInstance[], x: number, y: number): void {
    for (let i = 0; i < bucket.length; i++) {
      const inst = bucket[i];
      const prev = inst.shakeDecay;
      applyShakeImpulse(inst, x, y);
      if (inst.shakeDecay > prev && inst.burst
        && prev < inst.burst.threshold && inst.shakeDecay >= inst.burst.threshold) {
        this.burstEmit(inst, this.arena);
      }
    }
  }

  private _tickBucket(bucket: ReactiveInstance[], dt: number): void {
    const slow = getSlowDevice();
    const players = this.state.players;
    for (let i = 0; i < bucket.length; i++) {
      const inst = bucket[i];

      // Proximity / excitement. Also captures signed dx to nearest player so
      // direction-aware draw fns (grass parting, vine lean) don't re-scan.
      if (inst.proximity && !slow) {
        let nearestSq = Infinity;
        let nearestDx = 0;
        let found = false;
        for (let pi = 0; pi < players.length; pi++) {
          const p = players[pi];
          if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
          const px = p.x + p.width * 0.5;
          const py = p.y + p.height * 0.5;
          const dxFromInst = inst.pos.x - px;
          const dyFromInst = inst.pos.y - py;
          const d2 = dxFromInst * dxFromInst + dyFromInst * dyFromInst;
          if (d2 < nearestSq) { nearestSq = d2; nearestDx = dxFromInst; found = true; }
        }
        if (found) {
          updateExcitement(inst, Math.sqrt(nearestSq), dt);
          inst.nearestDx = nearestDx;
        } else {
          updateExcitement(inst, Infinity, dt);
          inst.nearestDx = undefined;
        }
      }

      // Shake decay (burst fires inside applyStompImpulse on rising edge,
      // not here — by the time we reach _tickBucket, shakeDecay has either
      // just been set to 1 with burst already fired, or is decaying).
      decayShake(inst, dt);
    }
  }
}
