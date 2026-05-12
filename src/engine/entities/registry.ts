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

export function registerEntity<T>(kind: EntityKind<T>): void {
  if (BY_ID.has(kind.id)) {
    BY_ID.set(kind.id, kind as EntityKind<unknown>);
    const idx = KINDS.findIndex(k => k.id === kind.id);
    if (idx >= 0) KINDS[idx] = kind as EntityKind<unknown>;
    return;
  }
  BY_ID.set(kind.id, kind as EntityKind<unknown>);
  KINDS.push(kind as EntityKind<unknown>);
}

export function getEntities(): ReadonlyArray<EntityKind<unknown>> {
  return KINDS;
}

export function getEntityById(id: string): EntityKind<unknown> | undefined {
  return BY_ID.get(id);
}

/** Subset of entities that draw on a specific layer, in registration order. */
export function getEntitiesForLayer(layer: EntityRenderLayer): ReadonlyArray<EntityKind<unknown>> {
  return KINDS.filter(k => k.renderLayer === layer && typeof k.draw === 'function');
}

/** Look up the entity collection on a MatchState. Asserts the id is a known
 *  field — the EntityKind contract makes `id: keyof MatchState`. */
export function getCollection(state: MatchState, id: keyof MatchState): unknown {
  return state[id];
}

/** Test helper — clear the registry. Production code should not call this. */
export function _resetEntityRegistry(): void {
  KINDS.length = 0;
  BY_ID.clear();
}
