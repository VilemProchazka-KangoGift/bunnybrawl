import type { GhostEntity } from '../types';
import type { EntityKind } from './types';
import { CANVAS_WIDTH } from '../constants';
import { updateGhosts } from '../gameLoop/gameplay/arenaEntities';
import { drawGhost } from '../rendering';

/** Per-player collision (`handleGhostCollision`) stays in
 *  `gameLoop/gameplay/playerCollisions.ts` — entity owns motion only.
 *  Drawn inline in `renderer.ts` between fg-nature and pollen so the
 *  call site doesn't go through `getEntitiesForLayer`. */
export const ghostsEntity: EntityKind<GhostEntity> = {
  id: 'ghosts',
  mirror: 'full',

  init({ theme, rng }) {
    const gc = theme.ghostConfig;
    if (!gc) return [];
    const out: GhostEntity[] = [];
    for (let i = 0; i < gc.count; i++) {
      out.push({
        x: rng() * CANVAS_WIDTH,
        y: 300 + rng() * 300,
        vx: (rng() < 0.5 ? -1 : 1) * gc.speed * (0.7 + rng() * 0.6),
        size: gc.size,
        alpha: 0.5 + rng() * 0.3,
        wobblePhase: rng() * Math.PI * 2,
      });
    }
    return out;
  },

  fixedUpdate(_state, { dt, state: matchState }) {
    updateGhosts(matchState, dt);
  },

  draw(ctx, state, { theme, time }) {
    for (const ghost of state) {
      drawGhost(ctx, ghost, theme, time);
    }
  },
};
