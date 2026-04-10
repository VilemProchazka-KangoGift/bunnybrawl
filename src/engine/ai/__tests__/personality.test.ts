import { describe, it, expect } from 'vitest';
import { getPersonality, getDifficultyParams } from '../personality';
import type { BotDifficulty } from '../types';

describe('getPersonality', () => {
  it('returns the same personality for all characters', () => {
    const bunny = getPersonality('bunny');
    const fox = getPersonality('fox');
    const wolf = getPersonality('wolf');
    expect(bunny).toBe(fox); // same object reference — all share DEFAULT
    expect(fox).toBe(wolf);
  });

  it('returns neutral personality values', () => {
    const p = getPersonality('bunny');
    expect(p.aggressiveness).toBe(1.0);
    expect(p.cautiousness).toBe(1.0);
    expect(p.greediness).toBe(0.8);
    expect(p.chaosAffinity).toBe(0.3);
    expect(p.targetLeader).toBe(false);
  });

  it('returns same personality for unknown character names', () => {
    const p = getPersonality('unknown_character');
    expect(p.aggressiveness).toBe(1.0);
  });
});

describe('getDifficultyParams', () => {
  const difficulties: BotDifficulty[] = ['easy', 'medium', 'hard', 'impossible'];

  it('returns valid params for all difficulty levels', () => {
    for (const d of difficulties) {
      const p = getDifficultyParams(d);
      expect(p).toBeDefined();
      expect(typeof p.reactionFrames).toBe('number');
      expect(typeof p.awarenessRadius).toBe('number');
      expect(typeof p.noiseChance).toBe('number');
      expect(typeof p.walkSpeedMult).toBe('number');
    }
  });

  it('easy has highest reaction delay', () => {
    expect(getDifficultyParams('easy').reactionFrames).toBe(30);
  });

  it('impossible has zero reaction delay', () => {
    expect(getDifficultyParams('impossible').reactionFrames).toBe(0);
  });

  it('difficulty progression: reaction frames decrease', () => {
    const easy = getDifficultyParams('easy').reactionFrames;
    const med = getDifficultyParams('medium').reactionFrames;
    const hard = getDifficultyParams('hard').reactionFrames;
    const imp = getDifficultyParams('impossible').reactionFrames;
    expect(easy).toBeGreaterThan(med);
    expect(med).toBeGreaterThan(hard);
    expect(hard).toBeGreaterThan(imp);
  });

  it('difficulty progression: awareness radius increases', () => {
    const easy = getDifficultyParams('easy').awarenessRadius;
    const med = getDifficultyParams('medium').awarenessRadius;
    const hard = getDifficultyParams('hard').awarenessRadius;
    const imp = getDifficultyParams('impossible').awarenessRadius;
    expect(easy).toBeLessThan(med);
    expect(med).toBeLessThan(hard);
    expect(hard).toBeLessThan(imp);
  });

  it('difficulty progression: noise chance decreases', () => {
    const easy = getDifficultyParams('easy').noiseChance;
    const med = getDifficultyParams('medium').noiseChance;
    const hard = getDifficultyParams('hard').noiseChance;
    const imp = getDifficultyParams('impossible').noiseChance;
    expect(easy).toBeGreaterThan(med);
    expect(med).toBeGreaterThan(hard);
    expect(hard).toBeGreaterThan(imp);
  });

  it('impossible has full chaosSuppress and precisionMult', () => {
    const p = getDifficultyParams('impossible');
    expect(p.chaosSuppress).toBe(1.0);
    expect(p.precisionMult).toBe(1.0);
  });

  it('easy/medium/hard have zero chaosSuppress and precisionMult', () => {
    for (const d of ['easy', 'medium', 'hard'] as BotDifficulty[]) {
      const p = getDifficultyParams(d);
      expect(p.chaosSuppress).toBe(0);
      expect(p.precisionMult).toBe(0);
    }
  });

  it('impossible has shortest taunt and zero search pause', () => {
    const p = getDifficultyParams('impossible');
    expect(p.tauntFrames).toBe(5);
    expect(p.searchPauseFrames).toBe(0);
    expect(p.jumpCooldownFrames).toBe(6);
  });

  it('all difficulties use full pathfinding', () => {
    for (const d of difficulties) {
      expect(getDifficultyParams(d).pathfindingDepth).toBe(Infinity);
    }
  });
});
