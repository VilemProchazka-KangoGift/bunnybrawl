// src/engine/gameLoop/cosmetics/ReactiveDecorationSystem.ts
import type { Arena, MatchState } from '../../types';
import type { CosmeticSystem } from '../types';
import { getSlowDevice } from '../../perfFlags';
import {
  applyShakeImpulse, decayShake, getReactiveKind, updateExcitement,
  type ReactiveInstance,
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
 * z-ordering of butterflies/bees vs trees/dandelions.
 */
export class ReactiveDecorationSystem implements CosmeticSystem {
  private state: MatchState;
  private arena: Arena;
  private burstEmit: BurstEmitter;

  private _instances30: ReactiveInstance[] = [];
  private _instances60: ReactiveInstance[] = [];
  private _windPhase = 0;

  constructor(state: MatchState, arena: Arena, burstEmit: BurstEmitter) {
    this.state = state;
    this.arena = arena;
    this.burstEmit = burstEmit;
  }

  init(): void {
    // No-op: instances are populated via setInstances() at arena-load time.
  }

  /** Replace the instance list. Buckets by registered kind frequency.
   *  Unknown kinds (no registration) are dropped with a warning. */
  setInstances(instances: ReactiveInstance[]): void {
    this._instances30.length = 0;
    this._instances60.length = 0;
    for (const inst of instances) {
      const cfg = getReactiveKind(inst.kind);
      if (!cfg) {
        console.warn(`[ReactiveDecorationSystem] unknown kind '${inst.kind}'`);
        continue;
      }
      if (cfg.highFrequency) this._instances60.push(inst);
      else this._instances30.push(inst);
    }
  }

  /** All 30Hz-bucketed instances. For Renderer use. */
  getInstances30Hz(): ReadonlyArray<ReactiveInstance> { return this._instances30; }
  /** All 60Hz-bucketed instances. For Renderer use. */
  getInstances60Hz(): ReadonlyArray<ReactiveInstance> { return this._instances60; }
  /** Current wind oscillator phase. For Renderer (passed to draw fns). */
  getWindPhase(): number { return this._windPhase; }

  /** 60Hz tick. Called from GameLoop.fixedUpdate. Advances windPhase, runs the
   *  60Hz instance bucket. */
  fixedUpdate(dt: number): void {
    this._windPhase += WIND_SPEED * dt;
    if (this._instances60.length > 0) this._tickBucket(this._instances60, dt);
  }

  /** 30Hz tick. Called from GameLoop.cosmeticStep. Runs the 30Hz instance bucket. */
  cosmeticUpdate(dt: number): void {
    if (this._instances30.length > 0) this._tickBucket(this._instances30, dt);
  }

  /** Apply a stomp impulse to all instances within their shakeRadius. Fires
   *  bursts immediately for any instance whose shakeDecay crosses its burst
   *  threshold on the rising edge. */
  applyStompImpulse(stompX: number, stompY: number): void {
    this._applyImpulseToBucket(this._instances30, stompX, stompY);
    this._applyImpulseToBucket(this._instances60, stompX, stompY);
  }

  /** Re-prime per-instance state (zeros excitement / shakeDecay). Used on
   *  guest reconnect or loading→playing edge to avoid stale carryover. */
  resetBaseline(): void {
    for (const i of this._instances30) { i.excitement = 0; i.shakeDecay = 0; }
    for (const i of this._instances60) { i.excitement = 0; i.shakeDecay = 0; }
  }

  cleanup(): void {
    this._instances30.length = 0;
    this._instances60.length = 0;
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
