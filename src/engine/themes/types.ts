import type { Arena, WeatherParticle, WildlifeEntity } from '../types';

export type ScatterFlockSpecies = 'bird' | 'bat' | 'crow';

// ---- Sub-config interfaces ----

export interface GradientStop {
  offset: number;  // 0..1
  color: string;
}

export interface CloudConfig {
  count: number;
  color: string;
  minSize: number;
  maxSize: number;
  minSpeed: number;
  maxSpeed: number;
  yRange: [number, number];
}

export interface WeatherTypeConfig {
  type: WeatherParticle['type'];
  weight: number;
  sizeRange: [number, number];
  vxRange: [number, number];
  vyRange: [number, number];
  rotSpeedRange: [number, number];
  color?: string;
}

export interface WeatherConfig {
  particleCount: number;
  types: WeatherTypeConfig[];
}

export interface WildlifeTypeConfig {
  type: WildlifeEntity['type'];
  weight: number;
  colors: string[];
  speedRange: [number, number];
  yRange: [number, number];
}

export interface WildlifeConfig {
  count: number;
  types: WildlifeTypeConfig[];
}

export interface FogConfig {
  count: number;
  baseY: number;
  yVariance: number;
  speedRange: [number, number];
  alphaRange: [number, number];
  color: string;
  sizeX: number;
  sizeY: number;
  opacity?: number;  // renderer alpha multiplier (default 0.3)
}

export interface AmbientParticleConfig {
  count: number;
  sizeRange: [number, number];
  vxRange: [number, number];
  vyRange: [number, number];
  alphaRange: [number, number];
  colors: string[];
}

export interface DayNightConfig {
  enabled: boolean;
  cycleDuration: number;
  maxNightAlpha: number;
  showFireflies: boolean;
  showShootingStars: boolean;
}

export interface PhysicsModifiers {
  gravity?: number;      // multiplier on base GRAVITY (1.0 = default)
  friction?: number;     // multiplier on base FRICTION
  walkSpeed?: number;    // multiplier on MAX_WALK_SPEED
  jumpImpulse?: number;  // multiplier on JUMP_IMPULSE
}

// ---- Main theme config ----

export interface ThemeConfig {
  id: string;
  nameKey: string;           // i18n key for display name
  previewGradient: string;   // CSS gradient for menu thumbnail
  previewIcon: string;       // Unicode icon for arena tile

  // Sky
  sky: { gradient: GradientStop[] };

  // Hills behind platforms
  hills: Array<{ x: number; baseY: number; width: number; height: number; color: string }>;

  // Ground surface styling
  ground: {
    surfaceColor: string;       // top surface line color
    surfaceThickness: number;   // px
    grassBlades?: {
      color: string;
      spacing: number;           // px between blades
      heightRange: [number, number];
    };
  };

  // Platform rendering
  platform: {
    floatingBodyColor: string;
    floatingTopColor: string;
    floatingAccentColor?: string;  // e.g. moss green or snow white strip
    groundBodyColor: string;
    groundTopColor: string;
    drawMoss: boolean;
    customDraw?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isGround: boolean) => void;
  };

  // Ambient systems
  clouds: CloudConfig;
  weather: WeatherConfig;
  wildlife: WildlifeConfig;
  fog: FogConfig;
  ambientParticles: AmbientParticleConfig;
  dayNight: DayNightConfig;

  // Custom draw functions for theme-specific decorations
  /** Drawn between hills and platforms — distant scenery like mountain ranges or treelines */
  drawFarBackground?: (ctx: CanvasRenderingContext2D, arena: Arena) => void;
  /** Drawn after platforms — trees, snowmen, decorations behind players */
  drawBackgroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => void;
  /** Drawn over players — foreground bushes, snow piles */
  drawForegroundNature: (ctx: CanvasRenderingContext2D, arena: Arena) => void;
  drawPlatform?: (ctx: CanvasRenderingContext2D, platform: import('../types').Platform, isGround: boolean) => void;
  /** Foreground overlay for platform body face — drawn after players for occlusion. */
  drawPlatformOverlay?: (ctx: CanvasRenderingContext2D, platform: import('../types').Platform, isGround: boolean) => void;

  /** Per-frame animated background. Drawn after the static bg cache and BEFORE clouds, so it composes as far-sky atmosphere (aurora, distant space objects). dayPhase: 0=noon, 0.5=midnight. matchState provides player positions for parting/proximity effects. */
  drawAnimatedBackground?: (ctx: CanvasRenderingContext2D, arena: Arena, time: number, dayPhase: number, matchState?: import('../types').MatchState) => void;

  /** Per-frame full-scene tint, drawn LAST after day-night overlay. Use for global mood washes (aurora green, lava red glow) that should affect every layer including players. */
  drawSceneTint?: (ctx: CanvasRenderingContext2D, dayPhase: number, time: number) => void;

  // Optional custom particle renderer (overrides default leaf/petal/snow drawing)
  drawWeatherParticle?: (ctx: CanvasRenderingContext2D, particle: WeatherParticle) => void;

  // Optional custom hazard zone renderer (e.g. icicle spikes instead of lava)
  drawCustomHazardZone?: (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, time: number) => void;

  // Optional custom ghost renderer (e.g. wasps for treetops)
  drawCustomGhost?: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, time: number) => void;

  // Optional custom thorn renderer (e.g. zombie hand for graveyard)
  drawCustomThorn?: (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, growScale: number, fadeAlpha: number) => void;

  // Optional custom spring renderer (e.g. bubble for underwater)
  drawCustomSpring?: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, bounceTimer: number, growScale: number, fadeAlpha: number) => void;

  // Optional ghost hazards (roaming enemies that hurt on touch)
  ghostConfig?: {
    count: number;
    speed: number;
    size: number;
    color: string;
    glowColor: string;
  };

  // Optional falling hazard rocks (volcano lava rocks falling from sky)
  lavaRockConfig?: {
    spawnInterval: [number, number]; // seconds between rocks
    fallSpeed: [number, number];     // vy range
    sizeRange: [number, number];
    color: string;
    glowColor: string;
  };


  // Optional pigeon flocks that scatter when disturbed
  pigeonConfig?: {
    positions: Array<{ x: number; y: number }>;
    respawnTime: number;
  };

  scatterFlockConfigs?: Array<{
    species: ScatterFlockSpecies;
    positions: Array<{ x: number; y: number }>;
    radius: number;
    respawnTime: number;
  }>;

  // Optional physics modifiers
  physics?: PhysicsModifiers;

  // Optional per-theme ambient sounds
  ambientSoundConfig?: AmbientSoundConfig;

  /** Render a glass bubble helmet on all characters. */
  bubbleHelmet?: boolean;
}

// ---- Ambient sound config ----

export interface PeriodicAmbientSound {
  sound: string;                   // SoundName (string to avoid circular import)
  intervalRange: [number, number]; // min/max seconds between plays
}

export interface AmbientSoundConfig {
  loops?: string[];
  periodic?: PeriodicAmbientSound[];
}
