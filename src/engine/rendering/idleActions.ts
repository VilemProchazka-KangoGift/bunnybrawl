import type { CharacterColors } from '../characters/types';
import { getCharacterPack } from '../characters/registry';

/** Player view passed to action apply functions — narrow shape, only what actions need. */
export interface IdleActionPlayerView {
  facing: 'left' | 'right';
}

/** A single idle action: data + a transform/effect applier. */
export interface IdleAction {
  id: string;
  duration: number;
  /** Optional per-action weight. Used for custom actions in PackIdleActionsConfig.custom; ignored for shared actions (overridden via weights map). */
  weight?: number;
  /** Apply transform/effect for normalized t in [0, 1]. Called before the cached sprite is drawn. */
  apply: (
    ctx: CanvasRenderingContext2D,
    cx: number, yOff: number, w: number, h: number,
    t: number,
    colors: CharacterColors,
    player: IdleActionPlayerView,
  ) => void;
}

export type SharedActionId = 'headBob' | 'headTilt' | 'headShake' | 'littleHop' | 'stretch' | 'lookAround';

export const SHARED_ACTION_IDS: SharedActionId[] = ['headBob', 'headTilt', 'headShake', 'littleHop', 'stretch', 'lookAround'];

/** Pack-level config attached to CharacterPack.idleActions. */
export interface PackIdleActionsConfig {
  weights?: Partial<Record<SharedActionId, number>>;  // override default 1.0; 0 disables
  custom?: IdleAction[];
}

const SHARED_ACTIONS: Record<SharedActionId, IdleAction> = {
  headBob: {
    id: 'headBob',
    duration: 0.7,
    apply: (ctx, _cx, _yOff, _w, _h, t) => {
      const pulse = Math.sin(t * Math.PI);
      ctx.translate(0, -pulse * 2);
    },
  },
  headTilt: {
    id: 'headTilt',
    duration: 0.7,
    apply: (ctx, cx, yOff, _w, h, t) => {
      const pulse = Math.sin(t * Math.PI);
      ctx.translate(cx, yOff + h * 0.5);
      ctx.rotate(pulse * 0.12);
      ctx.translate(-cx, -(yOff + h * 0.5));
    },
  },
  headShake: {
    id: 'headShake',
    duration: 0.8,
    apply: (ctx, cx, yOff, _w, h, t) => {
      const env = Math.sin(t * Math.PI);
      const osc = Math.sin(t * Math.PI * 4);
      ctx.translate(cx, yOff + h * 0.5);
      ctx.rotate(env * osc * 0.08);
      ctx.translate(-cx, -(yOff + h * 0.5));
    },
  },
  littleHop: {
    id: 'littleHop',
    duration: 0.55,
    apply: (ctx, _cx, _yOff, _w, _h, t) => {
      const lift = Math.sin(t * Math.PI) * 14;
      ctx.translate(0, -lift);
    },
  },
  stretch: {
    id: 'stretch',
    duration: 0.95,
    apply: (ctx, cx, yOff, _w, h, t) => {
      const pulse = Math.sin(t * Math.PI);
      const sy = 1 + pulse * 0.10;
      const sx = 1 - pulse * 0.05;
      const baseY = yOff + h;
      ctx.translate(cx, baseY);
      ctx.scale(sx, sy);
      ctx.translate(-cx, -baseY);
    },
  },
  lookAround: {
    id: 'lookAround',
    duration: 1.0,
    // Pure ctx transform — mirror the sprite around cx during the middle window
    // so the character "looks the other way" without touching player.facing.
    apply: (ctx, cx, _yOff, _w, _h, t) => {
      if (t >= 0.33 && t < 0.66) {
        ctx.translate(cx, 0);
        ctx.scale(-1, 1);
        ctx.translate(-cx, 0);
      }
    },
  },
};

export function getSharedAction(id: SharedActionId): IdleAction | null {
  return SHARED_ACTIONS[id] ?? null;
}

const poolCache = new Map<string, IdleAction[]>();
const weightCache = new Map<string, number[]>();

export function getActionPool(charName: string): IdleAction[] {
  const cached = poolCache.get(charName);
  if (cached) return cached;

  const pack = getCharacterPack(charName);
  const config = pack?.idleActions;
  const pool: IdleAction[] = [];

  for (const id of SHARED_ACTION_IDS) {
    const w = config?.weights?.[id];
    if (w === 0) continue;
    pool.push(SHARED_ACTIONS[id]);
  }
  if (config?.custom) {
    for (const c of config.custom) pool.push(c);
  }

  poolCache.set(charName, pool);
  return pool;
}

function getWeights(charName: string): number[] {
  const cached = weightCache.get(charName);
  if (cached) return cached;

  const pack = getCharacterPack(charName);
  const config = pack?.idleActions;
  const weights: number[] = [];

  for (const id of SHARED_ACTION_IDS) {
    const w = config?.weights?.[id];
    if (w === 0) continue;
    weights.push(w ?? 1.0);
  }
  if (config?.custom) {
    for (const c of config.custom) weights.push(c.weight ?? 1.0);
  }

  weightCache.set(charName, weights);
  return weights;
}

export function pickIdleAction(charName: string): { action: IdleAction; index: number } | null {
  const pool = getActionPool(charName);
  if (pool.length === 0) return null;
  const weights = getWeights(charName);

  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return null;

  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return { action: pool[i], index: i };
  }
  return { action: pool[pool.length - 1], index: pool.length - 1 };
}

export function getIdleAction(charName: string, index: number): IdleAction | null {
  const pool = getActionPool(charName);
  if (index < 0 || index >= pool.length) return null;
  return pool[index];
}

/** Test-only: clear the per-character pool/weight caches. */
export function clearIdleActionCache(): void {
  poolCache.clear();
  weightCache.clear();
}
