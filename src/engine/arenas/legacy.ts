/**
 * Backward-compatible wrappers for the old arena/theme API.
 * Drop-in replacements so existing consumers can switch import paths
 * without changing any call sites.
 */
import type { Arena } from '../types';
import type { ThemeConfig } from '../themes/types';
import { getArenaPackOrThrow, listArenaPacks, toArena, toThemeConfig } from './registry';
import { CANVAS_WIDTH } from '../constants';

/** Drop-in replacement for old getArena(id) from arena.ts */
export function getArena(id: string = 'meadow'): Arena {
  return toArena(getArenaPackOrThrow(id));
}

/** Drop-in replacement for old listArenas() from arena.ts */
export function listArenas(): Array<{ id: string; name: string; themeId: string }> {
  return listArenaPacks().map(p => ({
    id: p.id,
    name: p.translations.en ?? p.id,
    themeId: p.id,
  }));
}

/** Drop-in replacement for old getTheme(id) from themes/registry.ts */
export function getTheme(id: string): ThemeConfig {
  return toThemeConfig(getArenaPackOrThrow(id));
}

/** Drop-in replacement for old listThemes() from themes/registry.ts */
export function listThemes(): Array<{ id: string; nameKey: string; previewGradient: string; previewIcon: string }> {
  return listArenaPacks().map(p => ({
    id: p.id,
    nameKey: `arena_${p.id}`,
    previewGradient: p.previewGradient,
    previewIcon: p.previewIcon,
  }));
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
