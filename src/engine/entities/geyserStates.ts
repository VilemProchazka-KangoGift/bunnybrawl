import type { MatchState, EffectZone } from '../types';
import type { EntityKind } from './types';

const f = Math.fround;

export type GeyserState = MatchState['geyserStates'][number];

/** Geyser draw is intertwined with `arena.effectZones` iteration in
 *  `renderer.ts` (each zone type — zero_g / current / geyser — branches at
 *  the same site). Keeping it inline preserves that interleaving; the
 *  entity only declares init + tick + mirror policy. */
export const geyserStatesEntity: EntityKind<GeyserState> = {
  id: 'geyserStates',
  mirror: 'full',

  init({ arena, rng }) {
    return (arena.effectZones || []).filter(z => z.type === 'geyser').map(z => ({
      timer: (z.interval || 10) * rng(),
      active: false,
      activeTimer: 0,
    })) satisfies GeyserState[];
  },

  fixedUpdate(state, { dt, arena }) {
    // Single-pass tick — avoids per-tick allocation by indexing zones inline
    // rather than calling `arena.effectZones.filter(...)`.
    const zones: ReadonlyArray<EffectZone> = arena.effectZones || [];
    let gi = 0;
    for (let zi = 0; zi < zones.length; zi++) {
      if (zones[zi].type !== 'geyser') continue;
      const gz = zones[zi];
      const gs = state[gi++];
      if (!gs) break;
      if (!gs.active) {
        gs.timer = f(gs.timer - dt);
        if (gs.timer <= 0) {
          gs.active = true;
          gs.activeTimer = gz.duration || 3;
        }
      } else {
        gs.activeTimer = f(gs.activeTimer - dt);
        if (gs.activeTimer <= 0) {
          gs.active = false;
          gs.timer = gz.interval || 10;
        }
      }
    }
  },
};
