import type { SurfaceDecal } from '../types';
import type { EntityKind } from './types';
import { drawSurfaceDecals } from '../rendering';

/** Spawned + decayed by `SurfaceImpactSystem` (which owns the pool for
 *  decal eviction). The entity owns init + draw + mirror policy. */
export const surfaceDecalsEntity: EntityKind<SurfaceDecal> = {
  id: 'surfaceDecals',
  renderLayer: 'entities',
  mirror: 'none',

  init() {
    return [];
  },

  draw(ctx, _state, { state }) {
    drawSurfaceDecals(ctx, state);
  },
};
