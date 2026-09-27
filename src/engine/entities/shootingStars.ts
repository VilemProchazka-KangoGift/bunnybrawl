import type { MatchState } from '../types';
import type { EntityKind } from './types';
import { updateShootingStars } from '../gameLoop/cosmetics/environment';
import { getSlowDevice } from '../perfFlags';

export type ShootingStar = MatchState['shootingStars'][number];

/** Drawn inline by `drawDayNightCycle` in `rendering/effects.ts` because
 *  it interleaves with the celestial overlay (stars / fireflies). The
 *  entity owns init + tick + mirror policy; rendering stays where it is. */
export const shootingStarsEntity: EntityKind<ShootingStar> = {
  id: 'shootingStars',
  mirror: 'none',

  init() {
    return [];
  },

  cosmeticStep(_state, { dt, state: matchState, theme }) {
    if (getSlowDevice()) return;
    updateShootingStars(matchState, theme, dt);
  },
};
