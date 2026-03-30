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
