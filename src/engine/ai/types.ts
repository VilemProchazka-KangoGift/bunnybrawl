import type { BotDifficulty } from '../types';

export type { BotDifficulty };

export interface AIPersonality {
  aggressiveness: number;     // 0.3-2.0 — weight on stomp pursuit
  cautiousness: number;       // weight on threat evasion + hazard avoidance
  greediness: number;         // weight on carrot pursuit
  chaosAffinity: number;      // 0-1 — random noise injection
  platformPreference: number; // weight on high-ground seeking
  targetLeader: boolean;      // special: prioritize score leader
}

export interface DifficultyParams {
  reactionFrames: number;     // input delay (frames)
  awarenessRadius: number;    // px, Infinity = full map
  noiseChance: number;        // 0-1, chance per frame of random input
  exploitMechanics: boolean;  // use geysers, springs offensively
  jumpTimingNoise: number;    // frames of timing randomness for stomps
  walkSpeedMult: number;      // 0-1, multiplied into effective walk speed for this bot
  hesitationChance: number;   // 0-1, chance per frame to freeze and do nothing
}

export interface AwarenessSnapshot {
  self: { x: number; y: number; vx: number; vy: number; onGround: boolean; score: number; slowed: boolean; fat: boolean };
  nearestEnemy: { x: number; y: number; vx: number; vy: number; dx: number; dy: number; dist: number; score: number } | null;
  /** Always set regardless of awareness radius — used for roaming when nothing else to do */
  roamTarget: { x: number; y: number; dx: number } | null;
  stompTarget: { x: number; y: number; dx: number; dist: number } | null;
  stompThreat: { x: number; y: number; dist: number } | null;
  nearestCarrot: { x: number; y: number; dist: number } | null;
  nearestHazard: { type: string; x: number; y: number; dist: number } | null;
  nearbyHazards: Array<{ type: string; x: number; y: number; dist: number }>;
  nearestPlatformAbove: { x: number; y: number; width: number; dy: number } | null;
  nearestPlatformBelow: { x: number; y: number; width: number; dy: number } | null;
  nearEdge: boolean;
  windDir: number;
  windStrength: number;
  inZeroG: boolean;
  inCurrent: number; // vx push force, 0 if not in current
  nearGeyser: { x: number; y: number; active: boolean; timer: number } | null;
}

export interface ActionScores {
  moveLeft: number;
  moveRight: number;
  jump: number;
  drop: number;
}
