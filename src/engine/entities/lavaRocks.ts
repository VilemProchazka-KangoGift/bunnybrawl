import type { LavaRock } from '../types';
import type { EntityKind } from './types';
import { updateLavaRocks } from '../gameLoop/gameplay/arenaEntities';
import { drawLavaRock } from '../rendering';

export const lavaRocksEntity: EntityKind<LavaRock> = {
  id: 'lavaRocks',
  renderLayer: 'entities',
  mirror: 'full',

  init() {
    return [];
  },

  fixedUpdate(state, { dt, theme, rng, state: matchState }) {
    updateLavaRocks(matchState, theme, dt, rng);
    void state;
  },

  draw(ctx, state, { theme }) {
    for (const rock of state) {
      if (!rock.active) continue;
      drawLavaRock(ctx, rock, theme);
    }
  },
};
