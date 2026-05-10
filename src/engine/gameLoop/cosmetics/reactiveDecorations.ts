import type { Ctx2D } from '../../types';
// src/engine/gameLoop/cosmetics/reactiveDecorations.ts

export type ReactiveLayer = 'prePlayer' | 'postPlayer';

export type ProximityMode = 'flee' | 'lean' | 'excite';

export interface ReactiveInstance {
  /** World-space anchor (center for most kinds; arena packs decide). */
  pos: { x: number; y: number };
  /** Registry key — `<arenaId>.<kind>` convention. */
  kind: string;
  /** Per-instance deterministic seed for sway-phase offset, jitter, etc. */
  seed: number;
  /** Per-kind opaque payload — config + mutable state. Each kind's factory
   *  stamps a typed object here; the corresponding draw fn casts on read.
   *  Shape is private to the kind. Local-only — never snapshotted. */
  data?: unknown;

  // ---- Static reactivity opts (set by factory at registration) ----
  /** Sway amplitude in pixels. 0 / undefined = no wind sway. */
  windAmp?: number;
  proximity?: {
    radius: number;
    mode: ProximityMode;
    /** Steady-state bend amplitude at typical walking speed (~200 px/s). The
     *  spring-damper input scales by `magnitude / WALKING_SPEED_REF` so this
     *  remains the intuitive "this is how far it bends" knob across kinds. */
    magnitude: number;
  };
  /** Stomp shake radius. Undefined = stomp-immune. */
  shakeRadius?: number;
  /** Particle burst when shakeDecay crosses threshold (rising edge). */
  burst?: { threshold: number; particleKind: string; count: number };

  // ---- Runtime-mutated state (updated by the system per tick) ----
  /** 0..1, smoothed proximity scalar. Used for wind muting and as a "player
   *  is here" flag for kind-specific triggers (e.g. dandelion seed-burst). */
  excitement: number;
  /** 0..1, set on stomp impulse, decays each tick. */
  shakeDecay: number;
  /** Signed bend offset in px, driven by spring-damper response to player
   *  velocity. Positive = bend right, negative = bend left. The system
   *  integrates this in `_tickBucket`; draw fns read via `composeBend`. */
  bendValue: number;
  /** Rate of change of bendValue (px/s). Carries momentum so a fast player
   *  pass kicks the decoration even after they've left the radius. */
  bendVelocity: number;
  /** Cached per-instance scaling factor for the spring-damper input force —
   *  populated by the system at `setInstances` time from the kind's mode +
   *  magnitude. Force per (player × proximity) reduces to the single multiply
   *  `force += player.vx × proxFactor × bendCoeff`, hoisting the mode branch
   *  and magnitude scaling out of the per-frame inner loop. */
  bendCoeff: number;
}

export interface ReactiveKindConfig {
  /** Per-kind draw function. Receives current swayPhase / excitement / shake. */
  draw: ReactiveDraw;
  /** Render slot — drawn before players (`prePlayer`) or after (`postPlayer`). */
  layer: ReactiveLayer;
  /** Update at 60Hz (fixedUpdate) instead of default 30Hz (cosmeticStep). */
  highFrequency?: boolean;
  /** Reset mutable runtime state stored in `inst.data` (e.g. dandelion's
   *  burst phase). Called by `resetBaseline` on guest reconnect / loading→
   *  playing edge so kinds with in-flight animations don't resume mid-state.
   *  Optional: kinds whose `data` is config-only don't need this. */
  resetData?: (data: unknown) => void;
}

/** Per-frame argument bundle passed from GameLoop.renderFrame to Renderer.
 *  Inner arrays are stable references owned by ReactiveDecorationSystem
 *  (rebuilt only on `setInstances`), so no per-frame element copy. */
export interface ReactiveRenderArg {
  prePlayer: ReadonlyArray<ReactiveInstance>;
  postPlayer: ReadonlyArray<ReactiveInstance>;
  windPhase: number;
}

/**
 * Per-kind draw function. Called from Renderer once per frame per instance.
 *  - swayPhase: precomputed `sin(windPhase + seed * 0.7) * windAmp` (or 0 on slow-device).
 *  - dayPhase: 0..1, current day/night phase from MatchState.
 *  - time: matchState.timeElapsed in seconds.
 *  - state: full MatchState (needed by kinds that query player positions, e.g. flee behaviors).
 */
export type ReactiveDraw = (
  ctx: Ctx2D,
  instance: ReactiveInstance,
  swayPhase: number,
  time: number,
  dayPhase: number,
  state: import('../../types').MatchState,
) => void;

/** Factory helper — fills runtime-state defaults so kind authors only
 *  specify the static config (pos, kind, seed, data, windAmp, proximity,
 *  shakeRadius, burst). The system overwrites `bendCoeff` at setInstances
 *  time, so the zero default here is just a placeholder. */
export function createReactiveInstance(opts: {
  pos: { x: number; y: number };
  kind: string;
  seed: number;
  data?: unknown;
  windAmp?: number;
  proximity?: ReactiveInstance['proximity'];
  shakeRadius?: number;
  burst?: ReactiveInstance['burst'];
}): ReactiveInstance {
  return {
    ...opts,
    excitement: 0,
    shakeDecay: 0,
    bendValue: 0,
    bendVelocity: 0,
    bendCoeff: 0,
  };
}

// ---- Registry ----

const _kinds = new Map<string, ReactiveKindConfig>();

export function registerReactiveKind(name: string, opts: {
  draw: ReactiveDraw;
  layer: ReactiveLayer;
  highFrequency?: boolean;
  resetData?: (data: unknown) => void;
}): void {
  _kinds.set(name, {
    draw: opts.draw,
    layer: opts.layer,
    highFrequency: opts.highFrequency ?? false,
    resetData: opts.resetData,
  });
}

export function getReactiveKind(name: string): ReactiveKindConfig | undefined {
  return _kinds.get(name);
}

export function hasReactiveKind(name: string): boolean {
  return _kinds.has(name);
}

/** Test-only — clears the global registry. */
export function _resetReactiveKindsForTest(): void {
  _kinds.clear();
}

// ---- Primitives ----

/** Excitement rise rate (k in 1/s). Quick reaction when player enters radius. */
const EXCITEMENT_RISE_RATE = 2.4;
/** Excitement decay rate (k in 1/s). Slow settle so the wind-muting fades
 *  back gradually after the player leaves. */
const EXCITEMENT_DECAY_RATE = 0.4;

/** Stomp-shake decay per second. */
export const SHAKE_DECAY_RATE = 7;

// ---- Spring-damper bend dynamics ----
//
// The bend is modeled as a 1D spring-damper system: position `bendValue`
// and velocity `bendVelocity`. Each tick the system computes a force from
// nearby players' velocities and integrates the dynamics. This replaces the
// older "excitement × magnitude" position-based model, which under-reacted
// to fast players (short contact time → low excitement → small bend).
//
// Tuning rationale (BEND_STIFFNESS=28, BEND_DAMPING=5):
//  - Higher stiffness amplifies transient peaks: peak ≈ impulse/sqrt(k).
//    Doubling k from 12→28 roughly 1.5× the kick on a fast pass while
//    keeping equilibrium bend (= force/k) unchanged because the input force
//    formula scales with k (`forceCoeff = k / REF`).
//  - Damping ratio ζ = damping / (2·sqrt(k)) ≈ 0.47 — under-damped, with
//    a hint of overshoot/oscillation that reads as "alive."
//  - Period 2π/sqrt(k) ≈ 1.19s. Settling time (5%) ≈ 3/(ζω) ≈ 1.2s.
//  - Stability bound at dt=1/15 (the cosmetic-stagger rate): dt < 2/sqrt(k)
//    = 0.378s. We're at 0.067s — comfortable.

const BEND_STIFFNESS = 28;
const BEND_DAMPING = 5;

/** Reference walking speed used to scale `proximity.magnitude` into a
 *  spring-input force. Equilibrium bend at this player speed equals
 *  `proximity.magnitude`. Above this speed → larger transient kick;
 *  below → smaller bend. */
const WALKING_SPEED_REF = 200;

/** Update an instance's excitement based on the closest player's distance.
 *  Caller is responsible for finding the closest player and passing its distance.
 *  No-op if the instance has no proximity config. Asymmetric ease — fast rise,
 *  slow decay — via 1 - exp(-k*dt). */
export function updateExcitement(instance: ReactiveInstance, distanceToNearestPlayer: number, dt: number): void {
  if (!instance.proximity) return;
  const within = distanceToNearestPlayer < instance.proximity.radius;
  const target = within ? 1 : 0;
  const k = within ? EXCITEMENT_RISE_RATE : EXCITEMENT_DECAY_RATE;
  const alpha = 1 - Math.exp(-k * dt);
  instance.excitement += (target - instance.excitement) * alpha;
}

/** Integrate one timestep of the spring-damper bend dynamics. The caller
 *  supplies `force` — the sum of (player.vx × proximityFactor × magScale)
 *  over all players currently inside the proximity radius (with sign flipped
 *  for `mode === 'flee'`). Semi-implicit Euler keeps the integration stable
 *  at the system's 15-30Hz tick rate. */
export function tickBendDynamics(instance: ReactiveInstance, force: number, dt: number): void {
  const acc = -BEND_STIFFNESS * instance.bendValue
            - BEND_DAMPING * instance.bendVelocity
            + force;
  instance.bendVelocity += acc * dt;
  instance.bendValue += instance.bendVelocity * dt;
}

/** Compute the per-instance `bendCoeff` cache from the kind's proximity
 *  config. Called once at `setInstances` time. The hot-path inner loop then
 *  reduces to `force += player.vx × proxFactor × bendCoeff` (one multiply,
 *  no branch). Tuned so equilibrium bend at vx=WALKING_SPEED_REF, prox=1
 *  equals `magnitude` — kind authors keep thinking in pixels. */
export function bendCoeffForProximity(magnitude: number, mode: ProximityMode): number {
  if (mode === 'excite') return 0; // pure excitement scalar — no bend coupling
  const sign = mode === 'flee' ? -1 : 1;
  return sign * magnitude * BEND_STIFFNESS / WALKING_SPEED_REF;
}

/** Apply a stomp impulse: if the stomp is within `shakeRadius`, set shakeDecay to 1. */
export function applyShakeImpulse(instance: ReactiveInstance, stompX: number, stompY: number): void {
  if (instance.shakeRadius === undefined) return;
  const dx = stompX - instance.pos.x;
  const dy = stompY - instance.pos.y;
  if (dx * dx + dy * dy <= instance.shakeRadius * instance.shakeRadius) {
    instance.shakeDecay = 1;
  }
}

/** Decay shakeDecay toward 0 at SHAKE_DECAY_RATE per second. Mutates in place. */
export function decayShake(instance: ReactiveInstance, dt: number): void {
  if (instance.shakeDecay > 0) {
    instance.shakeDecay = Math.max(0, instance.shakeDecay - SHAKE_DECAY_RATE * dt);
  }
}

/** True iff `instance.shakeDecay` rose to or above the burst threshold this tick.
 *  Caller passes the previous (pre-tick) shake value.
 *
 *  Threshold semantics: rising-edge uses strict `<` on `prev` and `>=` on the
 *  new value. A threshold of exactly `1` would never fire, since `applyShakeImpulse`
 *  sets `shakeDecay = 1` and re-impulses leave `prev = 1`. Keep burst thresholds
 *  strictly below 1 (the meadow tree uses 0.95). */
export function shouldFireBurst(instance: ReactiveInstance, prevShake: number): boolean {
  if (!instance.burst) return false;
  return prevShake < instance.burst.threshold && instance.shakeDecay >= instance.burst.threshold;
}

/** Compose the full bend offset for a draw fn — wind sway muted by
 *  `(1 - excitement)` plus the velocity-driven `bendValue`. The wind muting
 *  smoothly hands off to the natural wind state as the player leaves and
 *  excitement decays, so the decoration doesn't snap past neutral on the way
 *  back to its wind-driven rest position. */
export function composeBend(instance: ReactiveInstance, swayPhase: number): number {
  return swayPhase * (1 - instance.excitement) + instance.bendValue;
}
