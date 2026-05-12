/**
 * Entity registry — central index keyed by `entity.id` (which must match a
 * field on `MatchState`). The registration order is observable: dispatch
 * loops (`Simulator.fixedUpdate`, the cosmetic system, the renderer's
 * layer walks) iterate in the order entities were registered. That order
 * is locked by `registerBuiltinEntities` below; changing it can shift
 * determinism snapshots.
 *
 * Built-in entities are registered at module scope from `App.tsx`. Tests
 * that instantiate `Simulator` directly need to register too — the
 * convention mirrors `registerBuiltinCharacters` / `registerBuiltinArenas`.
 */

import type { MatchState } from '../types';
import type { EntityKind, EntityRenderLayer } from './types';

const KINDS: EntityKind<unknown>[] = [];
const BY_ID: Map<string, EntityKind<unknown>> = new Map();
/** Pre-computed per-layer arrays — invalidated on register/reset. The
 *  renderer hits this once per frame per layer; lazy-filter would
 *  allocate at 60Hz × #layers. */
const BY_LAYER: Map<EntityRenderLayer, EntityKind<unknown>[]> = new Map();

function _invalidateLayerCache(): void {
  BY_LAYER.clear();
}

export function registerEntity<T>(kind: EntityKind<T>): void {
  if (BY_ID.has(kind.id)) {
    BY_ID.set(kind.id, kind as EntityKind<unknown>);
    const idx = KINDS.findIndex(k => k.id === kind.id);
    if (idx >= 0) KINDS[idx] = kind as EntityKind<unknown>;
    _invalidateLayerCache();
    return;
  }
  BY_ID.set(kind.id, kind as EntityKind<unknown>);
  KINDS.push(kind as EntityKind<unknown>);
  _invalidateLayerCache();
}

export function getEntities(): ReadonlyArray<EntityKind<unknown>> {
  return KINDS;
}

export function getEntityById(id: string): EntityKind<unknown> | undefined {
  return BY_ID.get(id);
}

/** Subset of entities that draw on a specific layer, in registration order. */
export function getEntitiesForLayer(layer: EntityRenderLayer): ReadonlyArray<EntityKind<unknown>> {
  let arr = BY_LAYER.get(layer);
  if (!arr) {
    arr = KINDS.filter(k => k.renderLayer === layer && typeof k.draw === 'function');
    BY_LAYER.set(layer, arr);
  }
  return arr;
}

/** Look up the entity collection on a MatchState. The EntityKind contract
 *  pins `id` to a `keyof MatchState`, so the runtime read is sound; the
 *  cast collapses to one place. */
export function getCollection<T>(state: MatchState, kind: EntityKind<T>): T[] {
  return (state as unknown as Record<string, T[]>)[kind.id];
}

/** Test helper — clear the registry. Production code should not call this. */
export function _resetEntityRegistry(): void {
  KINDS.length = 0;
  BY_ID.clear();
  _invalidateLayerCache();
}
