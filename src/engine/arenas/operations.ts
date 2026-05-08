// Arena lookup + transformation helpers (layered on top of the pack registry).

import type { Arena } from '../types';
import type { ThemeConfig } from '../themes/types';
import type { Light } from '../lighting/types';
import { getArenaPack, getArenaPackOrThrow, toArena, toThemeConfig } from './registry';
import { CANVAS_WIDTH } from '../constants';

export function getArena(id: string = 'meadow'): Arena {
  return toArena(getArenaPackOrThrow(id));
}

export function getTheme(id: string): ThemeConfig {
  return toThemeConfig(getArenaPackOrThrow(id));
}

/** L2: static emitter catalog for an arena. Returns empty array for arenas
 *  that haven't opted into the lighting catalog yet, or for unknown arena IDs
 *  (test fixtures often use synthetic IDs). */
export function getArenaLights(id: string): ReadonlyArray<Light> {
  return getArenaPack(id)?.lights ?? [];
}

/** Create a horizontally mirrored copy of an arena. Never mutates the original. */
export function mirrorArena(arena: Arena): Arena {
  const W = CANVAS_WIDTH;
  const mirrorX = (x: number, w: number) => W - x - w;
  const mirrorPt = (x: number) => W - x;

  return {
    ...arena,
    platforms: arena.platforms.map(p => ({ ...p, x: mirrorX(p.x, p.width) })),
    spawnPoints: arena.spawnPoints.map(s => ({ ...s, x: mirrorPt(s.x) })),
    hazardZones: arena.hazardZones?.map(h => ({ ...h, x: mirrorX(h.x, h.width) })),
    effectZones: arena.effectZones?.map(e => ({
      ...e,
      x: mirrorX(e.x, e.width),
      vx: e.vx != null ? -e.vx : undefined,
    })),
    noSpawnZones: arena.noSpawnZones?.map(z => ({ ...z, x: mirrorX(z.x, z.width) })),
    carrotZones: arena.carrotZones?.map(z => ({ ...z, x: mirrorX(z.x, z.width) })),
    navHints: arena.navHints?.map(h => ({
      ...h,
      inZone: { ...h.inZone, x: mirrorX(h.inZone.x, h.inZone.width) },
      approachX: mirrorPt(h.approachX),
    })),
  };
}
