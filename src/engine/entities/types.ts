/**
 * EntityKind contract — collapses a `MatchState` entity (lavaRocks,
 * scatterFlocks, gibs, …) into a single per-entity file. Each entity owns
 * its init, fixedUpdate, cosmeticStep, draw, mirror policy, and rollback
 * serialization so adding or removing one is a single-file change + one
 * `registerEntity()` call.
 *
 * Per-player coupling (collisions, push, fast-fall) stays in the player
 * loop — entities only express their own lifecycle. See
 * `docs/superpowers/plans/2026-05-12-entity-decoupling.md`.
 */

import type { Arena, Ctx2D, MatchSettings, MatchState, Player } from '../types';
import type { ThemeConfig } from '../themes/types';
import type { ParticleEmitter, SimulatorEvents } from '../simulator/types';

/** Context passed to `entity.fixedUpdate` — host-authoritative tick. */
export interface EntityFixedCtx {
  dt: number;
  state: MatchState;
  arena: Arena;
  theme: ThemeConfig;
  settings: MatchSettings;
  players: ReadonlyArray<Player>;
  rng: () => number;
  events: Required<SimulatorEvents>;
  particles: ParticleEmitter;
  resimulating: boolean;
}

/** Context passed to `entity.cosmeticStep` — half-rate (~30Hz) cosmetic tick. */
export interface EntityCosmeticCtx {
  dt: number;
  state: MatchState;
  arena: Arena;
  theme: ThemeConfig;
}

/** Context passed to `entity.draw`. */
export interface EntityRenderCtx {
  state: MatchState;
  arena: Arena;
  theme: ThemeConfig;
  /** matchState.timeElapsed forwarded as-is for entities that use it. */
  time: number;
  /** Seconds since the last cosmeticStep, used by particle-style draw paths. */
  cosmeticLead: number;
  frameTime: number;
}

/** Visual layer the entity participates in. The renderer walks the
 *  registry once per layer in `renderFrame`. Order within a layer follows
 *  the registry's insertion order, which is locked in
 *  `entities/registerBuiltinEntities`. */
export type EntityRenderLayer =
  /** Drawn between platform decorations and players (lava rocks,
   *  scatter flocks, surface decals). */
  | 'entities'
  /** Drawn after entities, before player sprites (gibs, confetti, ripples,
   *  shockwaves drawn inline already — gibs/confetti go here). */
  | 'particles'
  /** Drawn after player sprites, before fg-nature cache (ghosts, ambient). */
  | 'postPlayers'
  /** Drawn over the HUD (combo popups, score animations). */
  | 'hud';

/** Worker→main slim-mirror policy. `'full'` clones the field; `'none'`
 *  substitutes a frozen empty array. The wire snapshot (`net/snapshot/`)
 *  has its own schema and is unaffected by this. */
export type EntityMirrorPolicy = 'full' | 'none';

export interface EntityPolicy<TInstance> {
  /** Worker→main mirror filtering. Default `'full'`. Renderer-only
   *  collections (`fogParticles`, `gibs`, …) opt into `'none'`. */
  mirror?: EntityMirrorPolicy;

  /** Local-rollback save. Default: shallow clone of each instance.
   *  Override for entities whose elements need a deeper copy. */
  serialize?(state: ReadonlyArray<TInstance>): TInstance[];

  /** Local-rollback restore. Default: in-place `Object.assign` per element,
   *  trim length to source. Override only if the default would lose state
   *  (e.g. nested arrays). */
  restore?(target: TInstance[], snap: ReadonlyArray<TInstance>): void;
}

export interface EntityKind<TInstance> extends EntityPolicy<TInstance> {
  /** Stable identifier. MUST match the field name on `MatchState`. */
  readonly id: keyof MatchState & string;

  /** Visual layer the entity's `draw` participates in. Required when `draw`
   *  is defined; ignored otherwise. */
  readonly renderLayer?: EntityRenderLayer;

  /** Build initial state for a new match. Called from
   *  `createInitialMatchState` and `Simulator.switchArena`. */
  init(args: {
    arena: Arena;
    theme: ThemeConfig;
    settings: MatchSettings;
    rng: () => number;
  }): TInstance[];

  /** Host-side gameplay tick. Visual-only entities omit this. */
  fixedUpdate?(state: TInstance[], ctx: EntityFixedCtx): void;

  /** Half-rate cosmetic tick (host + guest). */
  cosmeticStep?(state: TInstance[], ctx: EntityCosmeticCtx): void;

  /** Render the entity. The renderer dispatches via `renderLayer`. */
  draw?(ctx: Ctx2D, state: TInstance[], renderCtx: EntityRenderCtx): void;
}
