import type { ArenaPack } from './types';
import type { Arena } from '../types';
import type { ThemeConfig } from '../themes/types';
import type { ArenaNav } from '../ai/navData';

// ---- Registry ----

const PACKS: Map<string, ArenaPack> = new Map();
const NAV: Map<string, ArenaNav> = new Map();

/** Register an arena pack. Overwrites any existing pack with the same id. */
export function registerArena(pack: ArenaPack): void {
  PACKS.set(pack.id, pack);
}

/** Attach auto-generated nav data for an arena. */
export function setArenaNav(arenaId: string, nav: ArenaNav): void {
  NAV.set(arenaId, nav);
}

// ---- Lookup ----

/** Get an arena pack by id. Returns undefined for unknown arenas. */
export function getArenaPack(id: string): ArenaPack | undefined {
  return PACKS.get(id);
}

/** Get an arena pack by id, throwing if not found. */
export function getArenaPackOrThrow(id: string): ArenaPack {
  const pack = PACKS.get(id);
  if (!pack) throw new Error(`Unknown arena: ${id}`);
  return pack;
}

/** Get nav data for an arena. */
export function getArenaNav(arenaId: string): ArenaNav | undefined {
  return NAV.get(arenaId);
}

// ---- Convenience lookups ----

/** Get arena display name for given language, falling back to English. */
export function getArenaDisplayName(id: string, lang: string): string {
  const pack = PACKS.get(id);
  if (!pack) return id;
  return pack.translations[lang] ?? pack.translations.en ?? id;
}

/** List all registered arenas with UI metadata. */
export function listArenaPacks(): Array<{
  id: string;
  previewGradient: string;
  previewIcon: string;
  translations: Record<string, string>;
}> {
  return Array.from(PACKS.values()).map(p => ({
    id: p.id,
    previewGradient: p.previewGradient,
    previewIcon: p.previewIcon,
    translations: p.translations,
  }));
}

// ---- Extractors ----
// Allow consumers that still expect Arena / ThemeConfig to work unchanged.

/** Extract the flat Arena struct from a pack. */
export function toArena(pack: ArenaPack): Arena {
  return {
    id: pack.id,
    name: pack.translations.en ?? pack.id,
    themeId: pack.id,
    width: pack.width,
    height: pack.height,
    platforms: pack.platforms,
    spawnPoints: pack.spawnPoints,
    hazardZones: pack.hazardZones,
    effectZones: pack.effectZones,
    bouncyPlatforms: pack.bouncyPlatforms,
    allowFallOff: pack.allowFallOff,
    noSpawnZones: pack.noSpawnZones,
    carrotZones: pack.carrotZones,
    noSprings: pack.noSprings,
    navHints: pack.navHints,
  };
}

/** Extract the ThemeConfig from a pack. */
export function toThemeConfig(pack: ArenaPack): ThemeConfig {
  return {
    id: pack.id,
    nameKey: `arena_${pack.id}`,
    previewGradient: pack.previewGradient,
    previewIcon: pack.previewIcon,
    sky: pack.sky,
    hills: pack.hills,
    ground: pack.ground,
    platform: pack.platform,
    clouds: pack.clouds,
    weather: pack.weather,
    wildlife: pack.wildlife,
    fog: pack.fog,
    ambientParticles: pack.ambientParticles,
    dayNight: pack.dayNight,
    drawFarBackground: pack.drawFarBackground,
    drawBackgroundNature: pack.drawBackgroundNature,
    drawForegroundNature: pack.drawForegroundNature,
    drawAnimatedBackground: pack.drawAnimatedBackground,
    drawWeatherParticle: pack.drawWeatherParticle,
    drawCustomHazardZone: pack.drawCustomHazardZone,
    drawCustomGhost: pack.drawCustomGhost,
    drawCustomThorn: pack.drawCustomThorn,
    drawCustomSpring: pack.drawCustomSpring,
    ghostConfig: pack.ghostConfig,
    lavaRockConfig: pack.lavaRockConfig,
    pigeonConfig: pack.pigeonConfig,
    physics: pack.physics,
    ambientSoundConfig: pack.ambientSoundConfig,
  };
}
