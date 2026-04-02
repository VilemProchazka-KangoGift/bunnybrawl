import type { AIPersonality, DifficultyParams, BotDifficulty } from './types';

// Each character has a distinct behavioral profile
const PERSONALITIES: Record<string, AIPersonality> = {
  Bunny:  { aggressiveness: 1.0, cautiousness: 1.0, greediness: 0.8, chaosAffinity: 0.2, targetLeader: false },
  Fox:    { aggressiveness: 1.8, cautiousness: 0.5, greediness: 0.4, chaosAffinity: 0.3, targetLeader: false },
  Frog:   { aggressiveness: 1.0, cautiousness: 0.6, greediness: 0.7, chaosAffinity: 0.8, targetLeader: false },
  Bear:   { aggressiveness: 0.6, cautiousness: 1.6, greediness: 0.5, chaosAffinity: 0.1, targetLeader: false },
  Owl:    { aggressiveness: 1.2, cautiousness: 1.2, greediness: 0.3, chaosAffinity: 0.1, targetLeader: false },
  Cat:    { aggressiveness: 1.4, cautiousness: 1.0, greediness: 0.6, chaosAffinity: 0.3, targetLeader: false },
  Wolf:   { aggressiveness: 1.6, cautiousness: 0.8, greediness: 0.3, chaosAffinity: 0.2, targetLeader: true },
  Panda:  { aggressiveness: 0.4, cautiousness: 1.0, greediness: 1.8, chaosAffinity: 0.3, targetLeader: false },
  Pig:    { aggressiveness: 0.8, cautiousness: 0.8, greediness: 1.6, chaosAffinity: 0.4, targetLeader: false },
  Cow:    { aggressiveness: 0.6, cautiousness: 1.4, greediness: 0.6, chaosAffinity: 0.1, targetLeader: false },
  Goat:   { aggressiveness: 0.8, cautiousness: 0.8, greediness: 0.4, chaosAffinity: 0.2, targetLeader: false },
  Horse:  { aggressiveness: 1.6, cautiousness: 0.4, greediness: 0.4, chaosAffinity: 0.3, targetLeader: false },
  Sheep:  { aggressiveness: 0.3, cautiousness: 1.8, greediness: 0.8, chaosAffinity: 0.2, targetLeader: false },
  Monkey: { aggressiveness: 1.0, cautiousness: 0.4, greediness: 1.2, chaosAffinity: 1.0, targetLeader: false },
  Tiger:  { aggressiveness: 1.8, cautiousness: 0.3, greediness: 0.6, chaosAffinity: 0.5, targetLeader: true },
  Rhino:  { aggressiveness: 1.4, cautiousness: 1.0, greediness: 0.5, chaosAffinity: 0.2, targetLeader: false },
  Hedgehog: { aggressiveness: 0.7, cautiousness: 1.6, greediness: 1.0, chaosAffinity: 0.3, targetLeader: false },
};

const DEFAULT_PERSONALITY: AIPersonality = {
  aggressiveness: 1.0, cautiousness: 1.0, greediness: 0.8, chaosAffinity: 0.3, targetLeader: false,
};

export function getPersonality(characterName: string): AIPersonality {
  return PERSONALITIES[characterName] ?? DEFAULT_PERSONALITY;
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
