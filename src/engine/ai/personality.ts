import type { AIPersonality, DifficultyParams, BotDifficulty } from './types';

// Character-specific personalities disabled — all bots use DEFAULT_PERSONALITY.
// Per-character differences caused desync in online play and were too subtle
// to notice in fast-paced gameplay.

const DEFAULT_PERSONALITY: AIPersonality = {
  aggressiveness: 1.0, cautiousness: 1.0, greediness: 0.8, chaosAffinity: 0.3, targetLeader: false,
};

export function getPersonality(_characterName: string): AIPersonality {
  // All bots use the same neutral personality — character-specific
  // personalities caused desync in online play (different assignments
  // → different behavior) and the differences were too subtle to notice
  // in the fast-paced gameplay.
  return DEFAULT_PERSONALITY;
}

const DIFFICULTY_PARAMS: Record<BotDifficulty, DifficultyParams> = {
  easy: {
    reactionFrames: 30,
    awarenessRadius: 180,
    noiseChance: 0.15,
    walkSpeedMult: 0.65,
    hesitationChance: 0.03,
    pathfindingDepth: Infinity,
    tauntFrames: 35,
    searchPauseFrames: 80,
    jumpCooldownFrames: 20,
    chaosSuppress: 0,
    precisionMult: 0,
  },
  medium: {
    reactionFrames: 10,
    awarenessRadius: 350,
    noiseChance: 0.08,
    walkSpeedMult: 0.9,
    hesitationChance: 0.01,
    pathfindingDepth: Infinity,
    tauntFrames: 35,
    searchPauseFrames: 80,
    jumpCooldownFrames: 20,
    chaosSuppress: 0,
    precisionMult: 0,
  },
  hard: {
    reactionFrames: 4,
    awarenessRadius: 900,
    noiseChance: 0.03,
    walkSpeedMult: 1.0,
    hesitationChance: 0,
    pathfindingDepth: Infinity,
    tauntFrames: 35,
    searchPauseFrames: 80,
    jumpCooldownFrames: 20,
    chaosSuppress: 0,
    precisionMult: 0,
  },
  impossible: {
    reactionFrames: 0,
    awarenessRadius: Infinity,
    noiseChance: 0,
    walkSpeedMult: 1.0,
    hesitationChance: 0,
    pathfindingDepth: Infinity,
    tauntFrames: 5,
    searchPauseFrames: 0,
    jumpCooldownFrames: 6,
    chaosSuppress: 1.0,
    precisionMult: 1.0,
  },
};

export function getDifficultyParams(difficulty: BotDifficulty): DifficultyParams {
  return DIFFICULTY_PARAMS[difficulty];
}
