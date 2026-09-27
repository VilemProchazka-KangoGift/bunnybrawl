import type { ConfettiParticle } from '../types';
import type { EntityKind } from './types';
import { drawConfetti } from '../rendering';

export const confettiEntity: EntityKind<ConfettiParticle> = {
  id: 'confetti',
  renderLayer: 'particles',
  mirror: 'none',

  init() {
    return [];
  },

  draw(ctx, state, { cosmeticLead }) {
    if (state.length === 0) return;
    drawConfetti(ctx, state, cosmeticLead);
  },
};
