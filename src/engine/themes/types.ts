import type { Arena, WeatherParticle, WildlifeEntity } from '../types';

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

  /** Per-frame animated background (drawn behind players, after wildlife — e.g. objects visible through windows) */
  drawAnimatedBackground?: (ctx: CanvasRenderingContext2D, arena: Arena, time: number) => void;

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

  // Optional physics modifiers
  physics?: PhysicsModifiers;
}
