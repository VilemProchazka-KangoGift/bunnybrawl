import type { Ripple } from '../types';
import type { EntityKind } from './types';
import { drawRipples } from '../rendering';

/** Spawned + decayed by `SurfaceImpactSystem` (which owns the pool for ripple
 *  eviction). The entity owns init + draw + mirror policy. */
export const ripplesEntity: EntityKind<Ripple> = {
  id: 'ripples',
  renderLayer: 'particles',
  mirror: 'none',

  init() {
    return [];
  },

  draw(ctx, _state, { state }) {
    drawRipples(ctx, state);
  },
};
