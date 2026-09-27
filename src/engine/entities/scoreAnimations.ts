import type { MatchState } from '../types';
import type { EntityKind } from './types';
import { updateScoreAnimations } from '../gameLoop/cosmetics/environment';

export type ScoreAnimation = MatchState['scoreAnimations'][number];

/** Spawned by HUDFeedbackSystem on score rising edge; drawn inside `drawHUD`'s
 *  internal `_drawScoreAnimations`. The entity owns init + decay + mirror; the
 *  HUD owns rendering (kept inline to avoid touching the HUD's drawing
 *  pipeline). */
export const scoreAnimationsEntity: EntityKind<ScoreAnimation> = {
  id: 'scoreAnimations',
  mirror: 'full',

  init() {
    return [];
  },

  cosmeticStep(_state, { dt, state: matchState }) {
    updateScoreAnimations(matchState, dt);
  },
};
