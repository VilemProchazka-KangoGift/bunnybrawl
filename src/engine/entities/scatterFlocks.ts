import type { MatchState } from '../types';
import type { EntityKind } from './types';
import { CANVAS_WIDTH } from '../constants';
import { updateScatterFlocks } from '../gameLoop/gameplay/arenaEntities';
import { updateScatterFlockParticles } from '../gameLoop/cosmetics/environment';
import { drawScatterFlock } from '../rendering';

export type ScatterFlock = MatchState['scatterFlocks'][number];

/** Player-trigger detection (`fixedUpdate` reads `state.scatterFlocks` inside
 *  the per-player loop in `Simulator.fixedUpdate`) stays where it is. The
 *  entity owns respawn-timer + particle physics + draw. */
export const scatterFlocksEntity: EntityKind<ScatterFlock> = {
  id: 'scatterFlocks',
  renderLayer: 'entities',
  mirror: 'none',

  init({ theme, settings }) {
    // Flock positions come from the theme, which mirrorArena never touches — so
    // on a mirrored layout the flocks would hover over the un-mirrored (now
    // empty) ledge. Mirror their x here so they sit over the mirrored perch.
    const mirror = settings.mods.mirrorArena;
    return (theme.scatterFlockConfigs || []).flatMap(cfg =>
      cfg.positions.map(p => ({
        species: cfg.species,
        x: mirror ? CANVAS_WIDTH - p.x : p.x, y: p.y,
        radius: cfg.radius,
        respawnTime: cfg.respawnTime,
        active: true, armed: true, respawnTimer: 0,
        scatterParticles: [] as ScatterFlock['scatterParticles'],
      }))
    );
  },

  fixedUpdate(_state, { dt, state: matchState }) {
    updateScatterFlocks(matchState, dt);
  },

  cosmeticStep(_state, { dt, state: matchState }) {
    updateScatterFlockParticles(matchState, dt);
  },

  draw(ctx, state, { time, cosmeticLead }) {
    for (const flock of state) {
      drawScatterFlock(ctx, flock, time, cosmeticLead);
    }
  },
};
