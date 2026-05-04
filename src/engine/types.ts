// Core game engine types

export interface Vec2 {
  x: number;
  y: number;
}

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Surface tag — drives footstep VFX, hard-landing decals, and shockwave
 * variants. `surfaceOf(plat)` defaults to 'grass' if a platform omits it.
 * Stays optional on the Platform interface so test fixtures don't need
 * to plumb a value through.
 */
export type SurfaceTag =
  | 'grass'
  | 'stone'
  | 'metal'
  | 'snow'
  | 'sand'
  | 'ice'
  | 'wood'
  | 'glass';

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  /** See SurfaceTag. Footstep + impact VFX dispatch on this. */
  surface?: SurfaceTag;
  /**
   * Optional per-platform style tag. Used by arena packs whose drawPlatform
   * function varies rendering per platform (e.g. rooftops: 'house' | 'hallway').
   * Arenas that don't use style can ignore it.
   */
  style?: string;
  /**
   * Optional inset (px) on the left collision edge. Lets characters approach
   * past plat.x by this many pixels before bonking. Used by arena packs whose
   * cap is drawn as an iso parallelogram (back-left shifts inward by `sp`)
   * so the visible top-left of the cap sits inside platform.x — without an
   * inset, characters bonk an invisible wall before reaching the visible edge.
   */
  leftCollisionInset?: number;
  /**
   * Optional inset (px) on the bottom collision edge. Lets characters rise
   * past plat.y + plat.height into the bottom strip without head-bumping.
   * Mirrors `leftCollisionInset` for the fake-3D skew (down): the body face
   * overlay (drawn after players) occludes characters in that window. Without
   * an inset, characters bonk a wall under the visible bottom edge of the body.
   */
  bottomCollisionInset?: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface HazardZone {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'lava';
}

export interface EffectZone {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'zero_g' | 'current' | 'geyser';
  vx?: number;       // for currents: horizontal push force (px/s)
  vy?: number;       // for currents: vertical push force (px/s, positive = down)
  strength?: number;  // for geysers: launch impulse
  interval?: number;  // for geysers: seconds between activations
  duration?: number;  // for geysers: active duration
}

export interface Arena {
  id: string;
  name: string;
  themeId: string;
  width: number;
  height: number;
  platforms: Platform[];
  spawnPoints: SpawnPoint[];
  hazardZones?: HazardZone[];
  effectZones?: EffectZone[];
  bouncyPlatforms?: number[];  // indices into platforms[] that bounce players
  allowFallOff?: boolean;
  noSpawnZones?: AABB[];       // zones where hazards/characters should not spawn
  carrotZones?: AABB[];        // zones with increased carrot spawn likelihood
  noSprings?: boolean;         // disable spring spawning on this arena
  /** Surface used when a platform omits `surface`. Falls back to 'grass'. */
  defaultSurface?: SurfaceTag;
  /** Nav hints: manual overrides for AI pathfinding in obstacle-blocked areas.
   *  When a bot is on `onPlatform` within `inZone` x-range, navTarget is overridden
   *  to route through `goTo` platform at `approachX`. Normal nav resumes after the hop. */
  navHints?: Array<{
    onPlatform: number;
    inZone: { x: number; width: number };
    goTo: number;
    approachX: number;
    type: 'j' | 'd';
  }>;
}

export type CharacterSlot = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
export type BotSlot = 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
export type PlayerSlot = CharacterSlot | BotSlot;

export const ALL_BOT_SLOTS: BotSlot[] = ['B1', 'B2', 'B3', 'B4', 'B5'];

export function isBotSlot(slot: PlayerSlot): slot is BotSlot {
  return slot.startsWith('B');
}

export interface CharacterDef {
  slot: PlayerSlot;
  name: string;
  color: string;
  darkColor: string;
  lightColor: string;
}

export type PlayerState = 'idle' | 'run' | 'airborne' | 'splat' | 'respawning';

export interface Player {
  id: PlayerSlot;
  character: CharacterDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  state: PlayerState;
  facing: 'left' | 'right';
  splatTimer: number;
  respawnTimer: number;
  invincibleTimer: number;
  score: number;
  active: boolean;
  animFrame: number;
  animTimer: number;
  fastFalling: boolean;
  fatTimer: number;
  slowTimer: number;
  squashScale: number;   // 1.0 = normal, <1 = squashed, >1 = stretched (vertical)
  squashTimer: number;   // decay timer for squash/stretch
  sideSquash: number;    // 1.0 = normal, <1 = squashed horizontally (wall/push)
  afterimages: Array<{x: number; y: number; facing: 'left'|'right'; alpha: number}>;
  idleAction: number;        // index into pack's idle action pool, -1 = none (resting)
  idleActionTimer: number;   // seconds remaining in current action or rest gap
  idleActionDuration: number;// total duration of current action; 0 during rest
  expression: 'normal' | 'scared' | 'angry' | 'dizzy';
  killStreak: number;    // current consecutive kills without dying
  breathTimer: number;         // for idle breathing animation
  springTrailTimer: number;    // >0 = spiral trail active after spring bounce
  damageFlashSide: 'left' | 'right' | null; // which side got hit
  damageFlashTimer: number;    // >0 = show red flash
  burnTimer: number;           // >0 = on fire from lava, spawns flame particles
  hitstopTimer: number;        // >0 = physics frozen (post-kill freeze)
  renderOffsetX: number;       // visual-only offset from rollback correction, decays to 0
  renderOffsetY: number;       // visual-only offset from rollback correction, decays to 0
  disconnected: boolean;       // true = player disconnected mid-match, don't respawn
}

export type SplatShape = 'circle' | 'star' | 'splat' | 'ring' | 'paw';

export interface SplatMark {
  x: number;
  y: number;
  radius: number;
  color: string;
  shape: SplatShape;
  particles: Array<{ x: number; y: number; radius: number }>;
}

export interface KillFeedEntry {
  attacker: PlayerSlot;
  victim: PlayerSlot;
  timestamp: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  down: boolean;
}

export interface KeyBindings {
  left: string;
  right: string;
  jump: string;
  down: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export type GibType = 'ear' | 'tail' | 'body' | 'snout' | 'horn' | 'wing' | 'beard' | 'mane' | 'wool' | 'spine';

export interface Gib {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
  color: string;
  darkColor: string;
  lightColor: string;
  characterName: string;
  gibType: GibType;
  bounced: boolean;
  life: number;
}

export type ConfettiShape = 'star' | 'diamond' | 'circle' | 'ribbon';

export interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: ConfettiShape;
  rotation: number;
  rotationSpeed: number;
  flutter: number;
}

export type GameScreen = 'menu' | 'charSelect' | 'match' | 'victory';

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';

export interface GameMods {
  extremeGore: boolean;
  carrotChase: boolean;
  giantPlayers: boolean;
  turbo: boolean;
  superBounce: boolean;
  mirrorArena: boolean;
  underwaterGravity: boolean;
}

export interface MatchSettings {
  killLimit: number;
  timeLimit: number; // seconds, 0 = off
  playerCount: number;
  goreMode: boolean;
  arenaId: string;
  botCount: number;
  botDifficulty: BotDifficulty;
  mods: GameMods;
}

// Pickups and hazards
export interface LavaRock {
  x: number;
  y: number;
  vy: number;
  size: number;
  rotation: number;
  active: boolean;
}

export interface Carrot {
  x: number;
  y: number;
  active: boolean;
  spawnTime: number; // for spawn VFX
}

export interface SpringMushroom {
  x: number;
  y: number;
  platformIndex: number;
  bounceTimer: number;
  life: number;    // time remaining before despawn
  growTimer: number; // grow-in animation (starts at ~0.5, counts down)
}

export interface Thorn {
  x: number;
  y: number;
  width: number;
  height: number;
  platformIndex: number;
  life: number;
  growTimer: number;
  hit: boolean;
}

/**
 * Persistent ground decal — spider-cracks (ice/glass) and hard-landing
 * scuffs. Rendered into the bg cache via fade-only redraw, mirroring
 * the SplatMark lifecycle. Local-only; not snapshotted.
 */
export interface SurfaceDecal {
  kind: 'crack' | 'scuff';
  x: number;
  y: number;
  age: number;          // seconds since spawn
  life: number;         // total lifetime in seconds (fade scales by 1 - age/life)
  seed: number;         // deterministic per-decal RNG for shape jitter
  color: string;        // tint (scuff = dark char tone, crack = white)
  surface: SurfaceTag;  // surface this decal sits on (drives shape style)
}

/** Liquid-impact ripple — cosmetic only, lives in MatchState until expired. */
export interface Ripple {
  x: number;
  y: number;
  age: number;
  life: number;
  maxRadius: number;
  surface: 'water' | 'lava';
}

export type MatchPhase = 'loading' | 'playing' | 'over';

export interface MatchState {
  players: Player[];
  phase: MatchPhase;
  killFeed: KillFeedEntry[];
  /** Total stomp count across the entire match. Distinct from killFeed.length
   *  because killFeed is trimmed to the most-recent 10 entries (HUD display
   *  budget). VictoryScreen reads this for the "Total Splats" stat. */
  totalKills: number;
  timeElapsed: number;
  matchOver: boolean;
  winner: PlayerSlot | null;
  carrots: Carrot[];
  carrotTimer: number;
  springs: SpringMushroom[];
  thorns: Thorn[];
  springSpawnTimer: number;
  thornSpawnTimer: number;
  screenShake: number; // remaining shake time
  slowMotion: number;  // remaining slow-mo time
  weather: WeatherParticle[];
  dayPhase: number;       // 0-1 cycle (0=noon, 0.5=night, 1=noon again)
  countdown: number;      // >0 = pre-match countdown in seconds, 0 = match running
  stats: MatchStats;
  shockwaves: Array<{x: number; y: number; radius: number; maxRadius: number; life: number; surface?: SurfaceTag}>;
  screenFlash: number;  // >0 = white flash on screen (for final kill)
  hitstopZoom: number;  // >0 = camera zoom punch active (eases out)
  wildlife: WildlifeEntity[];
  fogParticles: Array<{x: number; y: number; vx: number; alpha: number}>;
  pollenParticles: Array<{x: number; y: number; vx: number; vy: number; size: number; alpha: number}>;
  shootingStars: Array<{x: number; y: number; vx: number; vy: number; life: number; tailLen: number}>;
  scoreAnimations: Array<{playerId: PlayerSlot; value: number; timer: number}>;
  ghosts: GhostEntity[];
  lavaRocks: LavaRock[];
  lavaRockTimer: number;

  geyserStates: Array<{ timer: number; active: boolean; activeTimer: number }>;
  pigeonFlocks: Array<{ x: number; y: number; active: boolean; respawnTimer: number; scatterParticles: Array<{ x: number; y: number; vx: number; vy: number; life: number }> }>;
  bouncyWobble: Map<number, number>;  // platform index → wobble timer
  gibs: Gib[];
  confetti: ConfettiParticle[];
  /** Persistent ground decals (cracks/scuffs) — bg-cache rendered, capped. */
  surfaceDecals: SurfaceDecal[];
  /** Active liquid-impact ripples. */
  ripples: Ripple[];
}

export interface MatchStats {
  perPlayer: Map<PlayerSlot, PlayerStats>;
}

export interface PlayerStats {
  bestStreak: number;
  timeAirborne: number;
  distanceTraveled: number;
  carrotsEaten: number;
}

export interface WildlifeEntity {
  type: 'butterfly' | 'bird' | 'fish' | 'bat';
  x: number;
  y: number;
  vx: number;
  vy: number;
  wingPhase: number;
  color: string;
}

export type WeatherType = 'leaf' | 'petal' | 'snow' | 'ember' | 'ash' | 'bubble' | 'sprinkle' | 'spark' | 'raindrop';

export interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  type: WeatherType;
  rotation: number;
  rotSpeed: number;
  color?: string;
}

export interface GhostEntity {
  x: number;
  y: number;
  vx: number;
  size: number;
  alpha: number;
  wobblePhase: number;
}
