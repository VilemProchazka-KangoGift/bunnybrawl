import type { MatchState, EffectZone } from '../types';
import type { EntityKind } from './types';

const f = Math.fround;

export type GeyserState = MatchState['geyserStates'][number];

/** Cached filtered zones, keyed by arena identity. Mirrors the optimization
 *  on `ArenaEntitySystem.cachedGeyserZones`; without it the fixedUpdate
 *  loop would re-scan `arena.effectZones` every tick (60Hz). */
const _zoneCache = new WeakMap<readonly EffectZone[], EffectZone[]>();
function _geyserZonesFor(zones: ReadonlyArray<EffectZone> | undefined): EffectZone[] {
  if (!zones) return [];
  let cached = _zoneCache.get(zones);
  if (!cached) {
    cached = zones.filter(z => z.type === 'geyser');
    _zoneCache.set(zones, cached);
  }
  return cached;
}

/** Geyser draw is intertwined with `arena.effectZones` iteration in
 *  `renderer.ts` (each zone type — zero_g / current / geyser — branches at
 *  the same site). Keeping it inline preserves that interleaving; the
 *  entity only declares init + tick + mirror policy. */
export const geyserStatesEntity: EntityKind<GeyserState> = {
  id: 'geyserStates',
  mirror: 'full',

  init({ arena, rng }) {
    return _geyserZonesFor(arena.effectZones).map(z => ({
      timer: (z.interval || 10) * rng(),
      active: false,
      activeTimer: 0,
    })) satisfies GeyserState[];
  },

  fixedUpdate(state, { dt, arena }) {
    const zones = _geyserZonesFor(arena.effectZones);
    for (let gi = 0; gi < state.length; gi++) {
      const gs = state[gi];
      const gz = zones[gi];
      if (!gz) continue;
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
