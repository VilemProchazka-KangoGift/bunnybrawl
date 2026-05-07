// src/engine/gameLoop/cosmetics/sharedDecorationKinds.ts
//
// Reactive decoration kinds shared across multiple arenas. Promotion criterion:
// 3+ arenas using the kind with effectively identical config (radius, magnitude,
// windAmp, lean mode). Per-instance config (length, count, color) lives on
// `inst.data` so each arena tunes the LOOK while sharing the BEHAVIOR.
//
// Single source of truth for spring tuning of these kinds — change radius or
// magnitude here once instead of in 3 arena packs.
//
// Kind names use the `decoration.<name>` namespace to distinguish from the
// `<arenaId>.<name>` namespace used by arena-local kinds.

import { drawHangingVine, drawFern, drawTallGrass } from '../../themes/drawPrimitives';
import {
  registerReactiveKind,
  composeBend,
  createReactiveInstance,
  type ReactiveInstance,
} from './reactiveDecorations';

// ---- decoration.hangingVine ----
// Use cases: meadow, treetops, waterfall (rope-like hanging plants on platform undersides).
interface HangingVineData { length: number; }
export function buildHangingVine(x: number, y: number, length: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y }, kind: 'decoration.hangingVine',
    seed: Math.floor((x * 97 + y * 47) % 997),
    data: { length } satisfies HangingVineData,
    windAmp: 10,
    proximity: { radius: 36, mode: 'lean', magnitude: 30 },
  });
}
registerReactiveKind('decoration.hangingVine', {
  layer: 'prePlayer',
  draw: (ctx, inst, swayPhase) => {
    const { length } = inst.data as HangingVineData;
    drawHangingVine(ctx, inst.pos.x, inst.pos.y, length, composeBend(inst, swayPhase));
  },
});

// ---- decoration.fern ----
// Use cases: meadow, treetops, waterfall (ground/platform-edge ferns).
interface FernData { color?: string; }
export function buildFern(x: number, y: number, color?: string): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y }, kind: 'decoration.fern',
    seed: Math.floor((x * 79 + y * 37) % 997),
    data: { color } satisfies FernData,
    windAmp: 7,
    proximity: { radius: 36, mode: 'lean', magnitude: 24 },
  });
}
registerReactiveKind('decoration.fern', {
  layer: 'prePlayer',
  draw: (ctx, inst, swayPhase) => {
    const { color } = inst.data as FernData;
    drawFern(ctx, inst.pos.x, inst.pos.y, color, composeBend(inst, swayPhase));
  },
});

// ---- decoration.tallGrass ----
// Use cases: meadow, waterfall (grass clumps with player parting).
interface TallGrassData { count: number; }
export function buildTallGrass(x: number, y: number, count: number): ReactiveInstance {
  return createReactiveInstance({
    pos: { x, y }, kind: 'decoration.tallGrass',
    seed: Math.floor((x * 89 + y * 41) % 997),
    data: { count } satisfies TallGrassData,
    windAmp: 6,
    proximity: { radius: 36, mode: 'lean', magnitude: 30 },
  });
}
registerReactiveKind('decoration.tallGrass', {
  layer: 'prePlayer',
  draw: (ctx, inst, swayPhase) => {
    const { count } = inst.data as TallGrassData;
    drawTallGrass(ctx, inst.pos.x, inst.pos.y, count, undefined, undefined, composeBend(inst, swayPhase));
  },
});
