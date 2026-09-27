import type { MatchState } from '../types';
import type { EntityKind } from './types';
import { drawComboPopups } from '../rendering';

export type ComboPopup = MatchState['comboPopups'][number];

/** Cosmetic-only; spawned by `HUDFeedbackSystem` on killFeed transitions,
 *  drawn on the foreground canvas just before the HUD blit (dispatched
 *  inline from `renderer.ts`, not via `getEntitiesForLayer`). */
export const comboPopupsEntity: EntityKind<ComboPopup> = {
  id: 'comboPopups',
  mirror: 'none',

  init() {
    return [];
  },

  draw(ctx, _state, { state }) {
    drawComboPopups(ctx, state);
  },
};
