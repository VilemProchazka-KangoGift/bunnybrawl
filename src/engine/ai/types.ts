import type { BotDifficulty } from '../types';

export type { BotDifficulty };

export interface AIPersonality {
  aggressiveness: number;     // 0.3-2.0 — weight on stomp pursuit
  cautiousness: number;       // weight on threat evasion + hazard avoidance
  greediness: number;         // weight on carrot pursuit
  chaosAffinity: number;      // 0-1 — random noise injection
  targetLeader: boolean;      // special: prioritize score leader
}

export interface DifficultyParams {
  reactionFrames: number;     // input delay (frames)
  awarenessRadius: number;    // px, Infinity = full map
  noiseChance: number;        // 0-1, chance per frame of random input
  walkSpeedMult: number;      // 0-1, multiplied into effective walk speed for this bot
  hesitationChance: number;   // 0-1, chance per frame to freeze and do nothing
  pathfindingDepth: number;   // 0 = none (easy), 1 = 1-hop (medium), Infinity = full path (hard)
  tauntFrames: number;        // max taunt freeze after kill (35=default, 5=impossible)
  searchPauseFrames: number;  // max idle when nothing nearby (80=default, 0=impossible)
  jumpCooldownFrames: number; // frames between jumps (20=default, 6=impossible)
  chaosSuppress: number;      // 0-1, reduces personality chaosAffinity (0=none, 1=full suppress)
  precisionMult: number;      // 0-1, reduces jitter + lowers thresholds (0=normal, 1=precise)
}

/** Discriminator for awareness hazard entries. Matches the literal strings
 *  emitted by buildAwareness in awareness.ts — keep them in sync. */
export type HazardType = 'lava' | 'thorn' | 'ghost' | 'lavaRock';

export interface AwarenessSnapshot {
  self: { x: number; y: number; vx: number; vy: number; onGround: boolean; score: number; slowed: boolean; fat: boolean; invincible: boolean };
  nearestEnemy: { x: number; y: number; vx: number; vy: number; dx: number; dy: number; dist: number; score: number } | null;
  /** High-value target: fat, slowed, high-score, or on a kill streak — worth chasing even if not closest */
  priorityTarget: { x: number; y: number; dx: number; dy: number; dist: number; juiciness: number } | null;
  /** Always set regardless of awareness radius — used for roaming when nothing else to do */
  roamTarget: { x: number; y: number; dx: number } | null;
  stompTarget: { x: number; y: number; dx: number; dist: number } | null;
  stompThreat: { x: number; y: number; dist: number } | null;
  /** Airborne enemies above us (not necessarily falling yet) — dodge zone */
  airborneAbove: Array<{ x: number; dx: number; dy: number; dist: number }>;
  nearestCarrot: { x: number; y: number; dist: number } | null;
  nearestHazard: { type: HazardType; x: number; y: number; dist: number } | null;
  nearbyHazards: Array<{ type: HazardType; x: number; y: number; dist: number }>;
  nearestPlatformAbove: { x: number; y: number; width: number; dy: number } | null;
  nearestPlatformBelow: { x: number; y: number; width: number; dy: number } | null;
  /** When airborne, nearest platform we could land on */
  landingPlatform: { x: number; y: number; width: number; centerDx: number } | null;
  nearEdge: boolean;
  inZeroG: boolean;
  inCurrent: number; // vx push force, 0 if not in current
  nearGeyser: { x: number; y: number; active: boolean; timer: number } | null;
  /** If inside an active geyser zone, the dx to nearest edge to escape */
  geyserEscapeDx: number; // 0 = not in geyser, positive = go right, negative = go left
  /** How many other bots are within 120px */
  nearbyBotCount: number;
  /** Score of the current leader (for panic detection) */
  leaderScore: number;
  /** Is self on an elevated platform (above ground level)? */
  onElevatedPlatform: boolean;
  /** Index of the platform the bot is standing on (-1 if airborne) */
  currentPlatformIdx: number;
  /** Next platform to reach via precomputed nav graph (null if no goal, airborne, or easy difficulty) */
  navTarget: { x: number; y: number; width: number; approachX: number; type: 'j' | 'd' | 'w' | 'g' | 'z' } | null;
}

export interface ActionScores {
  moveLeft: number;
  moveRight: number;
  jump: number;
  drop: number;
}
