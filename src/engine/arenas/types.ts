import type { Arena, Platform, SpawnPoint, HazardZone, EffectZone, AABB, WeatherParticle } from '../types';
import type { ThemeConfig } from '../themes/types';
import type {
  GradientStop, CloudConfig, WeatherConfig, WildlifeConfig,
  FogConfig, AmbientParticleConfig, DayNightConfig,
  PhysicsModifiers, AmbientSoundConfig,
} from '../themes/types';

// Re-export sub-config types so pack files can import from here
export type {
  GradientStop, CloudConfig, WeatherConfig, WeatherTypeConfig,
  WildlifeConfig, WildlifeTypeConfig, FogConfig, AmbientParticleConfig,
  DayNightConfig, PhysicsModifiers, AmbientSoundConfig, PeriodicAmbientSound,
} from '../themes/types';

/**
 * A self-contained arena definition, combining structural layout (platforms,
 * spawns, hazards) with visual theme (sky, hills, draw functions) and metadata
 * (translations, music, preview).
 *
 * Mirrors the CharacterPack pattern — one file per arena in `arenas/packs/`.
 */
export interface ArenaPack {
  // ---- Identity ----
  id: string;
  /**
   * Whether this arena is selectable from the menu and pickable by random
   * arena resolution. Defaults to true. Set false for utility arenas like
   * the lobby that share the renderer pipeline but should never appear in
   * the arena selector.
   */
  playable?: boolean;

  // ---- UI metadata ----
  previewGradient: string;   // CSS gradient for menu thumbnail
  previewIcon: string;       // Unicode icon for arena tile

  // ---- Translations (like CharacterPack.translations) ----
  /** Display name per language code. Must include at least `en`. */
  translations: Record<string, string>;

  // ---- Layout (structural / gameplay) ----
  width: number;
  height: number;
  platforms: Platform[];
  spawnPoints: SpawnPoint[];
  hazardZones?: HazardZone[];
  effectZones?: EffectZone[];
  bouncyPlatforms?: number[];
  allowFallOff?: boolean;
  noSpawnZones?: AABB[];
  carrotZones?: AABB[];
  noSprings?: boolean;
  navHints?: Arena['navHints'];

  // ---- Visual config ----
  sky: { gradient: GradientStop[] };
  hills: Array<{ x: number; baseY: number; width: number; height: number; color: string }>;
  ground: {
    surfaceColor: string;
    surfaceThickness: number;
    grassBlades?: {
      color: string;
      spacing: number;
      heightRange: [number, number];
    };
  };
  platform: {
    floatingBodyColor: string;
    floatingTopColor: string;
    floatingAccentColor?: string;
    groundBodyColor: string;
    groundTopColor: string;
    drawMoss: boolean;
    customDraw?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isGround: boolean) => void;
  };

  // ---- Ambient systems ----
  clouds: CloudConfig;
  weather: WeatherConfig;
  wildlife: WildlifeConfig;
  fog: FogConfig;
  ambientParticles: AmbientParticleConfig;
  dayNight: DayNightConfig;

  // ---- Custom draw functions ----
  drawFarBackground?: (ctx: CanvasRenderingContext2D, arena: Arena) => void;
  drawBackgroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => void;
  drawForegroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => void;
  /**
   * Optional full override of platform rendering. When defined, the renderer
   * calls this instead of the built-in flat-rect fallback. Receives the full
   * Platform object so packs can dispatch on `platform.style` if needed.
   *
   * For arenas with `leftCollisionInset` (architectural iso caps), this
   * function should draw ONLY the cap + right face (the parts that always
   * sit behind the player). The body face goes in `drawPlatformOverlay` so
   * it can occlude players that enter the iso phantom strip.
   */
  drawPlatform?: (ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean) => void;
  /**
   * Optional foreground overlay for the platform's body face. Called by the
   * renderer AFTER players are drawn, so the body occludes any player whose
   * bbox overlaps the body's draw region. Architectural arenas with iso caps
   * use this to keep the iso back-left shift visually consistent: the player
   * can stand or jump into the phantom strip [plat.x, plat.x + sp] and the
   * body face hides the part of the sprite that would otherwise reveal the
   * collision-vs-visible mismatch.
   */
  drawPlatformOverlay?: (ctx: CanvasRenderingContext2D, platform: Platform, isGround: boolean) => void;
  drawAnimatedBackground?: (ctx: CanvasRenderingContext2D, arena: Arena, time: number, dayPhase: number) => void;
  drawSceneTint?: (ctx: CanvasRenderingContext2D, dayPhase: number, time: number) => void;
  drawWeatherParticle?: (ctx: CanvasRenderingContext2D, particle: WeatherParticle) => void;
  drawCustomHazardZone?: (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, time: number) => void;
  drawCustomGhost?: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, time: number) => void;
  drawCustomThorn?: (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, growScale: number, fadeAlpha: number) => void;
  drawCustomSpring?: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, bounceTimer: number, growScale: number, fadeAlpha: number) => void;

  // ---- Gameplay modifiers (types synced with ThemeConfig) ----
  /** Render a glass bubble helmet on all characters in this arena. */
  bubbleHelmet?: boolean;
  ghostConfig?: ThemeConfig['ghostConfig'];
  lavaRockConfig?: ThemeConfig['lavaRockConfig'];
  pigeonConfig?: ThemeConfig['pigeonConfig'];
  scatterFlockConfigs?: ThemeConfig['scatterFlockConfigs'];
  physics?: PhysicsModifiers;

  // ---- Audio ----
  ambientSoundConfig?: AmbientSoundConfig;
  /** MP3 filename relative to public/audio/, e.g. 'meadow.mp3' */
  musicFile?: string;

  // ---- AI navigation (auto-generated by scripts/generateNavData.ts) ----
  navData?: ArenaNav;
}

// ---- Navigation graph types ----

/** Compact nav edge: t=target platform, y=type (j/d/w/g/z), x=approachX, d=danger (0-100). */
export interface NavEdge {
  t: number;
  y: 'j' | 'd' | 'w' | 'g' | 'z';
  x: number;
  d?: number;
}

export interface ArenaNav {
  /** edges[platformIdx] = outgoing edges from that platform */
  edges: NavEdge[][];
  /** nextHop[from][to] = fastest next platform. -1 = same platform, -2 = unreachable */
  nextHop: number[][];
  /** safeHop[from][to] = safest path (avoids hazards). Same encoding as nextHop */
  safeHop: number[][];
}
