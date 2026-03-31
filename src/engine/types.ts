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

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface Arena {
  name: string;
  width: number;
  height: number;
  platforms: Platform[];
  spawnPoints: SpawnPoint[];
  backgroundColor: string;
  groundColor: string;
  platformColor: string;
}

export type CharacterSlot = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export interface CharacterDef {
  slot: CharacterSlot;
  name: string;
  color: string;
  darkColor: string;
  lightColor: string;
}

export type PlayerState = 'idle' | 'run' | 'airborne' | 'splat' | 'respawning';

export interface Player {
  id: CharacterSlot;
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
  squashScale: number;   // 1.0 = normal, <1 = squashed, >1 = stretched
  squashTimer: number;   // decay timer for squash/stretch
  afterimages: Array<{x: number; y: number; facing: 'left'|'right'; alpha: number}>;
  idleAnimTimer: number; // for character-specific idle animations
  expression: 'normal' | 'scared' | 'angry' | 'dizzy';
  killStreak: number;    // current consecutive kills without dying
  breathTimer: number;         // for idle breathing animation
  springTrailTimer: number;    // >0 = spiral trail active after spring bounce
  damageFlashSide: 'left' | 'right' | null; // which side got hit
  damageFlashTimer: number;    // >0 = show red flash
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
  attacker: CharacterSlot;
  victim: CharacterSlot;
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

export type GameScreen = 'menu' | 'charSelect' | 'match' | 'victory';

export interface MatchSettings {
  killLimit: number;
  timeLimit: number; // seconds, 0 = off
  playerCount: number;
  goreMode: boolean;
}

// Pickups and hazards
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

export interface MatchState {
  players: Player[];
  splatMarks: SplatMark[];
  killFeed: KillFeedEntry[];
  timeElapsed: number;
  matchOver: boolean;
  winner: CharacterSlot | null;
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
  shockwaves: Array<{x: number; y: number; radius: number; maxRadius: number; life: number}>;
  screenFlash: number;  // >0 = white flash on screen (for final kill)
  wildlife: WildlifeEntity[];
  fogParticles: Array<{x: number; y: number; vx: number; alpha: number}>;
  pollenParticles: Array<{x: number; y: number; vx: number; vy: number; size: number; alpha: number}>;
  shootingStars: Array<{x: number; y: number; vx: number; vy: number; life: number}>;
  scoreAnimations: Array<{playerId: CharacterSlot; value: number; timer: number}>;
}

export interface MatchStats {
  perPlayer: Map<CharacterSlot, PlayerStats>;
}

export interface PlayerStats {
  bestStreak: number;
  timeAirborne: number;
  distanceTraveled: number;
  carrotsEaten: number;
}

export interface WildlifeEntity {
  type: 'butterfly' | 'bird';
  x: number;
  y: number;
  vx: number;
  vy: number;
  wingPhase: number;
  color: string;
}

export interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  type: 'leaf' | 'petal';
  rotation: number;
  rotSpeed: number;
}
