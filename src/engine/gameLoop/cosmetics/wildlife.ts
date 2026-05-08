// src/engine/gameLoop/cosmetics/wildlife.ts
//
// Cosmetic helpers + kind registry + factory for the WildlifeSystem.
// Mirrors the structure of `reactiveDecorations.ts` — arena packs register
// kinds at module load time and emit instances from `ArenaPack.buildWildlife`.
//
// The built-in `wildlife.groundCritter` kind covers all current migrated
// wildlife (snails, crabs, rats, gumdrops, robots, squirrels) — they all
// share `tickGroundCritter` patrol/flee logic from `themes/utils.ts`. Per-
// instance draw functions live on `inst.data.draw`, so each pack keeps its
// own sprite art without registering a unique kind ID.
//
// Authors registering bespoke kinds (a new flock or zone-hopper not yet
// covered) call `registerWildlifeKind` directly with their own tick + draw.

import type { Arena, MatchState, Player } from '../../types';
import {
  type GroundCritterState,
  type GroundCritterConfig,
  tickGroundCritter,
} from '../../themes/utils';

/** Render layer — drawn in the renderer slot that matches the layer name.
 *  - `groundCritter`: renderer slot where ground-walking ambient creatures
 *    appear (the existing `drawGroundCritters` callsite).
 *  - `animBackground`: renderer slot where animated mid-distance background
 *    elements appear (the existing `drawAnimatedBackground` callsite, used by
 *    the treetops squirrel that perches on far-back branches). */
export type WildlifeLayer = 'groundCritter' | 'animBackground';

export interface WildlifeInstance<TData = unknown> {
  /** Registry key — `'wildlife.<kindName>'` convention. */
  kindId: string;
  /** Per-instance deterministic seed (for jitter, etc.). */
  seed: number;
  /** Anchor position. Some kinds use it as a home; others as a spawn anchor.
   *  Always set so the system has a stable handle without prying into `data`. */
  home: { x: number; y: number };
  /** Per-kind opaque payload — config + mutable state. The kind's `tick` and
   *  `draw` cast on read. Local-only — never snapshotted. */
  data: TData;
}

export type WildlifeTick<TData = unknown> = (
  inst: WildlifeInstance<TData>,
  dt: number,
  players: ReadonlyArray<Player>,
  arena: Arena,
) => void;

export type WildlifeDraw<TData = unknown> = (
  ctx: CanvasRenderingContext2D,
  inst: WildlifeInstance<TData>,
  time: number,
  state: MatchState,
) => void;

export interface WildlifeKindConfig<TData = unknown> {
  layer: WildlifeLayer;
  /** Tick the instance — usually advances per-instance state. */
  tick: WildlifeTick<TData>;
  /** Draw the instance. */
  draw: WildlifeDraw<TData>;
  /** Reset mutable runtime state stored in `inst.data`. Called by the system
   *  on guest reconnect / loading→playing edge so kinds don't resume mid-state. */
  resetData?: (data: unknown) => void;
}

// ---- Per-frame argument bundle (mirrors ReactiveRenderArg) ----

/** Per-frame argument bundle passed from GameLoop.renderFrame to Renderer.
 *  Inner arrays are stable references owned by WildlifeSystem (rebuilt only
 *  on `setInstances`), so no per-frame element copy. */
export interface WildlifeRenderArg {
  groundCritter: ReadonlyArray<WildlifeInstance>;
  animBackground: ReadonlyArray<WildlifeInstance>;
}

// ---- Registry ----

const _kinds = new Map<string, WildlifeKindConfig>();

export function registerWildlifeKind<TData>(
  name: string,
  cfg: WildlifeKindConfig<TData>,
): void {
  _kinds.set(name, cfg as unknown as WildlifeKindConfig);
}

export function getWildlifeKind(name: string): WildlifeKindConfig | undefined {
  return _kinds.get(name);
}

export function hasWildlifeKind(name: string): boolean {
  return _kinds.has(name);
}

/** Test-only — clears the global registry. */
export function _resetWildlifeKindsForTest(): void {
  _kinds.clear();
}

// ---- Factory ----

export function createWildlifeInstance<TData>(opts: {
  kindId: string;
  seed: number;
  home: { x: number; y: number };
  data: TData;
}): WildlifeInstance<TData> {
  return {
    kindId: opts.kindId,
    seed: opts.seed,
    home: { ...opts.home },
    data: opts.data,
  };
}

// ============================================================================
// Built-in kind: 'wildlife.groundCritter'
// ============================================================================
//
// Single shared kind for all `tickGroundCritter`-driven creatures. The unique
// per-pack draw lives in `inst.data.draw`, called by the registered kind draw.
// Two layer flavors are pre-registered (`wildlife.groundCritter` and
// `wildlife.groundCritter.animBg`) so packs can opt their critter into either
// renderer slot without inventing new kind IDs.

export const KIND_GROUND_CRITTER = 'wildlife.groundCritter';
export const KIND_GROUND_CRITTER_ANIM_BG = 'wildlife.groundCritter.animBg';

export interface GroundCritterDrawArgs {
  ctx: CanvasRenderingContext2D;
  state: GroundCritterState;
  cfg: GroundCritterConfig;
  time: number;
  /** Match state (read-only access, e.g. for darkening at night). Optional —
   *  most ground-critter draws ignore it. */
  matchState: MatchState;
}

export interface GroundCritterData {
  state: GroundCritterState;
  cfg: GroundCritterConfig;
  /** Per-pack draw hook. Receives the live state + cfg. */
  draw: (args: GroundCritterDrawArgs) => void;
}

const groundCritterTick: WildlifeTick<GroundCritterData> = (inst, dt, players) => {
  tickGroundCritter(inst.data.state, players, dt, inst.data.cfg);
};

const groundCritterDraw: WildlifeDraw<GroundCritterData> = (ctx, inst, time, state) => {
  const d = inst.data;
  d.draw({ ctx, state: d.state, cfg: d.cfg, time, matchState: state });
};

const groundCritterReset = (data: unknown): void => {
  const d = data as GroundCritterData;
  d.state.x = (d.cfg.platL + d.cfg.platR) / 2;
  d.state.dir = 1;
  d.state.facingEase = 1;
  d.state.fleeing = false;
  d.state.committedFleeDir = 0;
};

registerWildlifeKind<GroundCritterData>(KIND_GROUND_CRITTER, {
  layer: 'groundCritter',
  tick: groundCritterTick,
  draw: groundCritterDraw,
  resetData: groundCritterReset,
});
registerWildlifeKind<GroundCritterData>(KIND_GROUND_CRITTER_ANIM_BG, {
  layer: 'animBackground',
  tick: groundCritterTick,
  draw: groundCritterDraw,
  resetData: groundCritterReset,
});

/** Build a groundCritter instance. The pack supplies the patrol config, an
 *  optional starting offset, and the draw function. Set `layer` to
 *  `'animBackground'` for critters that should render in the animated-bg slot
 *  (e.g. the treetops squirrel).
 *
 *  `initialFacingEase` defaults to 1 to match legacy pack initialization
 *  (most packs hand-rolled critter state with `facingEase: 1` regardless of
 *  starting `dir`). Override per-pack if a different starting facing is
 *  desired. */
export function buildGroundCritter(opts: {
  seed: number;
  cfg: GroundCritterConfig;
  initialX?: number;
  initialDir?: 1 | -1;
  initialFacingEase?: number;
  layer?: WildlifeLayer;
  draw: GroundCritterData['draw'];
}): WildlifeInstance<GroundCritterData> {
  const cfg = opts.cfg;
  const startX = opts.initialX ?? (cfg.platL + cfg.platR) / 2;
  const dir: 1 | -1 = opts.initialDir ?? 1;
  const facingEase = opts.initialFacingEase ?? 1;
  const data: GroundCritterData = {
    state: {
      x: startX,
      dir,
      facingEase,
      fleeing: false,
      committedFleeDir: 0,
    },
    cfg,
    draw: opts.draw,
  };
  const kindId = opts.layer === 'animBackground'
    ? KIND_GROUND_CRITTER_ANIM_BG
    : KIND_GROUND_CRITTER;
  return createWildlifeInstance<GroundCritterData>({
    kindId,
    seed: opts.seed,
    home: { x: startX, y: cfg.platTopY },
    data,
  });
}
