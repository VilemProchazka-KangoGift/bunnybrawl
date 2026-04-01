import type { AIPersonality, DifficultyParams, BotDifficulty } from './types';

// Each character has a distinct behavioral profile
const PERSONALITIES: Record<string, AIPersonality> = {
  Bunny:  { aggressiveness: 1.0, cautiousness: 1.0, greediness: 0.8, chaosAffinity: 0.2, platformPreference: 1.0, targetLeader: false },
  Fox:    { aggressiveness: 1.8, cautiousness: 0.5, greediness: 0.4, chaosAffinity: 0.3, platformPreference: 0.8, targetLeader: false },
  Frog:   { aggressiveness: 1.0, cautiousness: 0.6, greediness: 0.7, chaosAffinity: 0.8, platformPreference: 1.2, targetLeader: false },
  Bear:   { aggressiveness: 0.6, cautiousness: 1.6, greediness: 0.5, chaosAffinity: 0.1, platformPreference: 1.4, targetLeader: false },
  Owl:    { aggressiveness: 1.2, cautiousness: 1.2, greediness: 0.3, chaosAffinity: 0.1, platformPreference: 1.8, targetLeader: false },
  Cat:    { aggressiveness: 1.4, cautiousness: 1.0, greediness: 0.6, chaosAffinity: 0.3, platformPreference: 1.0, targetLeader: false },
  Wolf:   { aggressiveness: 1.6, cautiousness: 0.8, greediness: 0.3, chaosAffinity: 0.2, platformPreference: 0.8, targetLeader: true },
  Panda:  { aggressiveness: 0.4, cautiousness: 1.0, greediness: 1.8, chaosAffinity: 0.3, platformPreference: 0.8, targetLeader: false },
  Pig:    { aggressiveness: 0.8, cautiousness: 0.8, greediness: 1.6, chaosAffinity: 0.4, platformPreference: 0.8, targetLeader: false },
  Cow:    { aggressiveness: 0.6, cautiousness: 1.4, greediness: 0.6, chaosAffinity: 0.1, platformPreference: 0.8, targetLeader: false },
  Goat:   { aggressiveness: 0.8, cautiousness: 0.8, greediness: 0.4, chaosAffinity: 0.2, platformPreference: 2.0, targetLeader: false },
  Horse:  { aggressiveness: 1.6, cautiousness: 0.4, greediness: 0.4, chaosAffinity: 0.3, platformPreference: 0.7, targetLeader: false },
  Sheep:  { aggressiveness: 0.3, cautiousness: 1.8, greediness: 0.8, chaosAffinity: 0.2, platformPreference: 1.0, targetLeader: false },
  Monkey: { aggressiveness: 1.0, cautiousness: 0.4, greediness: 1.2, chaosAffinity: 1.0, platformPreference: 1.4, targetLeader: false },
};

const DEFAULT_PERSONALITY: AIPersonality = {
  aggressiveness: 1.0, cautiousness: 1.0, greediness: 0.8, chaosAffinity: 0.3, platformPreference: 1.0, targetLeader: false,
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
    pathfindingDepth: 0,
  },
  medium: {
    reactionFrames: 6,
    awarenessRadius: 400,
    noiseChance: 0.06,
    walkSpeedMult: 1.0,
    hesitationChance: 0,
    pathfindingDepth: 1,
  },
  hard: {
    reactionFrames: 2,
    awarenessRadius: Infinity,
    noiseChance: 0.01,
    walkSpeedMult: 1.0,
    hesitationChance: 0,
    pathfindingDepth: Infinity,
  },
};

export function getDifficultyParams(difficulty: BotDifficulty): DifficultyParams {
  return DIFFICULTY_PARAMS[difficulty];
}
