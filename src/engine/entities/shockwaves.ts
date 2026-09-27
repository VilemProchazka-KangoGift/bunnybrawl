import type { MatchState } from '../types';
import type { EntityKind } from './types';
import { SHOCKWAVE_DURATION } from '../constants';
import { updateShockwaves } from '../gameLoop/cosmetics/environment';

export type Shockwave = MatchState['shockwaves'][number];

export const shockwavesEntity: EntityKind<Shockwave> = {
  id: 'shockwaves',
  renderLayer: 'particles',
  mirror: 'none',

  init() {
    return [];
  },

  cosmeticStep(_state, { dt, state: matchState }) {
    updateShockwaves(matchState, dt);
  },

  draw(ctx, state) {
    if (state.length === 0) return;
    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    for (const sw of state) {
      const progress = 1 - sw.life / SHOCKWAVE_DURATION;
      ctx.globalAlpha = sw.life / SHOCKWAVE_DURATION;
      ctx.lineWidth = Math.max(1, 4 * (1 - progress));
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },
};
