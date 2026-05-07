import type { ArenaPack, ArenaNav } from './types';
import type { Arena } from '../types';
import type { ThemeConfig } from '../themes/types';

// ---- Registry ----

const PACKS: Map<string, ArenaPack> = new Map();
const NAV: Map<string, ArenaNav> = new Map();

export function registerArena(pack: ArenaPack): void {
  PACKS.set(pack.id, pack);
  if (pack.navData) NAV.set(pack.id, pack.navData);
}

// ---- Lookup ----

export function getArenaPack(id: string): ArenaPack | undefined {
  return PACKS.get(id);
}

export function getArenaPackOrThrow(id: string): ArenaPack {
  const pack = PACKS.get(id);
  if (!pack) throw new Error(`Unknown arena: ${id}`);
  return pack;
}

export function getArenaNav(arenaId: string): ArenaNav | undefined {
  return NAV.get(arenaId);
}

// ---- Convenience lookups ----

/** Falls back to English, then to the raw id. */
export function getArenaDisplayName(id: string, lang: string): string {
  const pack = PACKS.get(id);
  if (!pack) return id;
  return pack.translations[lang] ?? pack.translations.en ?? id;
}

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

/**
 * Like listArenaPacks() but excludes packs flagged with `playable: false`
 * (e.g. the lobby). Use for arena pickers, random-arena resolution, online
 * settings sync — anywhere a player might select a match arena.
 */
export function listPlayableArenaPacks(): Array<{
  id: string;
  previewGradient: string;
  previewIcon: string;
  translations: Record<string, string>;
}> {
  return Array.from(PACKS.values())
    .filter(p => p.playable !== false)
    .map(p => ({
      id: p.id,
      previewGradient: p.previewGradient,
      previewIcon: p.previewIcon,
      translations: p.translations,
    }));
}

// ---- Extractors ----
// Extract legacy Arena / ThemeConfig from a pack for consumers that still need them.

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
    defaultSurface: pack.defaultSurface,
  };
}

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
    drawPlatform: pack.drawPlatform,
    drawPlatformOverlay: pack.drawPlatformOverlay,
    drawForegroundNature: pack.drawForegroundNature,
    drawAnimatedBackground: pack.drawAnimatedBackground,
    drawAnimatedForeground: pack.drawAnimatedForeground,
    buildReactiveDecorations: pack.buildReactiveDecorations,
    cosmeticTick: pack.cosmeticTick,
    drawGroundCritters: pack.drawGroundCritters,
    drawSceneTint: pack.drawSceneTint,
    drawWeatherParticle: pack.drawWeatherParticle,
    drawCustomHazardZone: pack.drawCustomHazardZone,
    drawCustomGhost: pack.drawCustomGhost,
    drawCustomThorn: pack.drawCustomThorn,
    drawCustomSpring: pack.drawCustomSpring,
    ghostConfig: pack.ghostConfig,
    lavaRockConfig: pack.lavaRockConfig,
    pigeonConfig: pack.pigeonConfig,
    scatterFlockConfigs: pack.scatterFlockConfigs,
    physics: pack.physics,
    ambientSoundConfig: pack.ambientSoundConfig,
    bubbleHelmet: pack.bubbleHelmet,
  };
}
