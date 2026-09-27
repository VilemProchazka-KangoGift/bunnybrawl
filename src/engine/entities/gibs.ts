import type { Gib } from '../types';
import type { EntityKind } from './types';
import { drawGibs } from '../rendering';

/** `gibs` are spawned externally (e.g. from stomps via `launchGib`). The
 *  entity owns init + draw + mirror policy only. Lifetime tick runs inside
 *  `drawGibs` itself (motion is integrated at render time using `cosmeticLead`). */
export const gibsEntity: EntityKind<Gib> = {
  id: 'gibs',
  renderLayer: 'particles',
  mirror: 'none',

  init() {
    return [];
  },

  draw(ctx, state, { cosmeticLead }) {
    if (state.length === 0) return;
    drawGibs(ctx, state, cosmeticLead);
  },
};
