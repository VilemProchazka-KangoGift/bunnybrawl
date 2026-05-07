// src/engine/gameLoop/cosmetics/reactiveDecorations.ts

export type ReactiveLayer = 'background' | 'foreground';

export type ProximityMode = 'flee' | 'lean' | 'excite';

export interface ReactiveInstance {
  /** World-space anchor (center for most kinds; arena packs decide). */
  pos: { x: number; y: number };
  /** Registry key — `<arenaId>.<kind>` convention. */
  kind: string;
  /** Per-instance deterministic seed for sway-phase offset, jitter, etc. */
  seed: number;

  // ---- Static reactivity opts (set by factory at registration) ----
  /** Sway amplitude in pixels. 0 / undefined = no wind sway. */
  windAmp?: number;
  proximity?: {
    radius: number;
    mode: ProximityMode;
    /** Kind-relative; the draw fn interprets it. */
    magnitude: number;
  };
  /** Stomp shake radius. Undefined = stomp-immune. */
  shakeRadius?: number;
  /** Particle burst when shakeDecay crosses threshold (rising edge). */
  burst?: { threshold: number; particleKind: string; count: number };

  // ---- Runtime-mutated state (updated by the system per tick) ----
  /** 0..1, smoothed proximity scalar. */
  excitement: number;
  /** 0..1, set on stomp impulse, decays each tick. */
  shakeDecay: number;
}

export interface ReactiveKindConfig {
  /** Per-kind draw function. Receives current swayPhase / excitement / shake. */
  draw: ReactiveDraw;
  /** Render slot — pre-player or post-player. Defaults to 'background'. */
  layer: ReactiveLayer;
  /** Update at 60Hz (fixedUpdate) instead of default 30Hz (cosmeticStep). */
  highFrequency?: boolean;
}

/**
 * Per-kind draw function. Called from Renderer once per frame per instance.
 *  - swayPhase: precomputed `sin(windPhase + seed * 0.7) * windAmp` (or 0 on slow-device).
 *  - dayPhase: 0..1, current day/night phase from MatchState.
 *  - time: matchState.timeElapsed in seconds.
 *  - state: full MatchState (needed by kinds that query player positions, e.g. flee behaviors).
 */
export type ReactiveDraw = (
  ctx: CanvasRenderingContext2D,
  instance: ReactiveInstance,
  swayPhase: number,
  time: number,
  dayPhase: number,
  state: import('../../types').MatchState,
) => void;

// ---- Registry ----

const _kinds = new Map<string, ReactiveKindConfig>();

export function registerReactiveKind(name: string, opts: { draw: ReactiveDraw; layer: ReactiveLayer; highFrequency?: boolean }): void {
  _kinds.set(name, {
    draw: opts.draw,
    layer: opts.layer,
    highFrequency: opts.highFrequency ?? false,
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

/** Excitement decay/rise rate (k in 1/s). At 30Hz this gives ≈10-frame ease (≈0.33s). */
const EXCITEMENT_RATE = 2.4;

/** Stomp-shake decay per second. */
export const SHAKE_DECAY_RATE = 7;

/** Update an instance's excitement based on the closest player's distance.
 *  Caller is responsible for finding the closest player and passing its distance.
 *  No-op if the instance has no proximity config. Frame-rate-independent ease
 *  via 1 - exp(-k*dt). */
export function updateExcitement(instance: ReactiveInstance, distanceToNearestPlayer: number, dt: number): void {
  if (!instance.proximity) return;
  const target = distanceToNearestPlayer < instance.proximity.radius ? 1 : 0;
  const alpha = 1 - Math.exp(-EXCITEMENT_RATE * dt);
  instance.excitement += (target - instance.excitement) * alpha;
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
 *  Caller passes the previous (pre-tick) shake value. */
export function shouldFireBurst(instance: ReactiveInstance, prevShake: number): boolean {
  if (!instance.burst) return false;
  return prevShake < instance.burst.threshold && instance.shakeDecay >= instance.burst.threshold;
}
