import { describe, it, expect } from 'vitest';
import { AIController } from '../aiController';
import { buildAwareness } from '../awareness';
import { evaluateActions } from '../utility';
import { getPersonality, getDifficultyParams } from '../personality';
import type { Player, MatchState, Arena, PlayerSlot } from '../../types';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../../constants';

// Helper to create a minimal player
function makePlayer(overrides: Partial<Player> & { id: PlayerSlot }): Player {
  return {
    id: overrides.id,
    character: { slot: overrides.id, name: 'Bunny', color: '#FFF', darkColor: '#CCC', lightColor: '#FFF' },
    x: 200, y: 500, vx: 0, vy: 0,
    width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
    state: 'idle', facing: 'right',
    splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
    score: 0, active: true, animFrame: 0, animTimer: 0,
    fastFalling: false, fatTimer: 0, slowTimer: 0,
    squashScale: 1, squashTimer: 0, sideSquash: 1, afterimages: [],
    idleAnimTimer: 0, expression: 'normal',
    killStreak: 0, breathTimer: 0, springTrailTimer: 0,
    damageFlashSide: null, damageFlashTimer: 0, burnTimer: 0,
    ...overrides,
  };
}

// Helper to create a minimal match state
function makeState(overrides?: Partial<MatchState>): MatchState {
  return {
    players: [],
    killFeed: [],
    timeElapsed: 30,
    matchOver: false,
    winner: null,
    carrots: [],
    carrotTimer: 10,
    springs: [],
    thorns: [],
    springSpawnTimer: 10,
    thornSpawnTimer: 10,
    screenShake: 0,
    slowMotion: 0,
    weather: [],
    dayPhase: 0,
    countdown: 0,
    stats: { perPlayer: new Map() },
    shockwaves: [],
    screenFlash: 0,
    wildlife: [],
    fogParticles: [],
    pollenParticles: [],
    shootingStars: [],
    scoreAnimations: [],
    ghosts: [],
    lavaRocks: [],
    lavaRockTimer: 10,

    geyserStates: [],
    pigeonFlocks: [],
    bouncyWobble: new Map(),
    ...overrides,
  };
}

// Minimal arena
function makeArena(overrides?: Partial<Arena>): Arena {
  return {
    id: 'test',
    name: 'Test',
    themeId: 'meadow',
    width: 1280,
    height: 720,
    platforms: [
      { x: 0, y: 660, width: 1280, height: 60 }, // ground
      { x: 400, y: 500, width: 200, height: 20 }, // floating platform
      { x: 700, y: 400, width: 200, height: 20 }, // higher platform
    ],
    spawnPoints: [
      { x: 100, y: 660 },
      { x: 300, y: 660 },
      { x: 500, y: 660 },
      { x: 700, y: 660 },
      { x: 900, y: 660 },
      { x: 1100, y: 660 },
    ],
    ...overrides,
  };
}

describe('AIController', () => {
  it('returns input with all 4 booleans', () => {
    const ai = new AIController('B1', 'Bunny', 'medium');
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 800, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    const input = ai.getInput(bot, state, arena);
    expect(input).toHaveProperty('left');
    expect(input).toHaveProperty('right');
    expect(input).toHaveProperty('jump');
    expect(input).toHaveProperty('down');
    expect(typeof input.left).toBe('boolean');
    expect(typeof input.right).toBe('boolean');
    expect(typeof input.jump).toBe('boolean');
    expect(typeof input.down).toBe('boolean');
  });

  it('returns no-op for splatted bots', () => {
    const ai = new AIController('B1', 'Bunny', 'medium');
    const bot = makePlayer({ id: 'B1', state: 'splat', splatTimer: 1 });
    const state = makeState({ players: [bot] });
    const arena = makeArena();

    const input = ai.getInput(bot, state, arena);
    expect(input).toEqual({ left: false, right: false, jump: false, down: false });
  });

  it('returns no-op for respawning bots', () => {
    const ai = new AIController('B1', 'Fox', 'hard');
    const bot = makePlayer({ id: 'B1', state: 'respawning', respawnTimer: 1 });
    const state = makeState({ players: [bot] });
    const arena = makeArena();

    const input = ai.getInput(bot, state, arena);
    expect(input).toEqual({ left: false, right: false, jump: false, down: false });
  });

  it('moves toward enemy when chasing', () => {
    const ai = new AIController('B1', 'Fox', 'hard'); // aggressive
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 800, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    // Run frames to flush reaction buffer and sample multiple outputs
    // (noise chance means individual frames can be random)
    let rightCount = 0;
    for (let i = 0; i < 60; i++) {
      const input = ai.getInput(bot, state, arena);
      if (input.right) rightCount++;
    }
    // Fox is aggressive — should move toward enemy (right) most of the time
    expect(rightCount).toBeGreaterThan(10);
  });

  it('produces varied input over multiple frames', () => {
    const ai = new AIController('B1', 'Monkey', 'medium'); // chaotic
    const bot = makePlayer({ id: 'B1', x: 400, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 600, y: 400 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    const inputs: string[] = [];
    for (let i = 0; i < 90; i++) {
      const input = ai.getInput(bot, state, arena);
      inputs.push(JSON.stringify(input));
      // Simulate bot moving slightly to avoid stuck detection
      bot.x += (input.right ? 2 : 0) - (input.left ? 2 : 0);
    }

    // With chaos affinity, should have some variety in frames
    const unique = new Set(inputs);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('escapes when stuck', () => {
    const ai = new AIController('B1', 'Bear', 'hard');
    const bot = makePlayer({ id: 'B1', x: 400, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 800, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    // Simulate being stuck (don't move the bot)
    // Stuck timer increments every frame, escape fires on next decision frame after timer > 45,
    // then traverses reaction buffer (4 frames for hard). Run 80 frames to be safe.
    let gotJump = false;
    for (let i = 0; i < 80; i++) {
      const input = ai.getInput(bot, state, arena);
      if (input.jump) gotJump = true;
    }
    // After stuck timer exceeds 45, should trigger escape with a jump
    expect(gotJump).toBe(true);
  });
});

describe('Awareness', () => {
  it('detects nearest enemy', () => {
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const near = makePlayer({ id: 'P1', x: 350, y: 628 });
    const far = makePlayer({ id: 'P2', x: 900, y: 628 });
    const state = makeState({ players: [bot, near, far] });
    const arena = makeArena();

    const awareness = buildAwareness(bot, state, arena, Infinity);
    expect(awareness.nearestEnemy).not.toBeNull();
    expect(awareness.nearestEnemy!.x).toBe(350);
  });

  it('detects stomp target below', () => {
    const bot = makePlayer({ id: 'B1', x: 500, y: 400, state: 'airborne' });
    const victim = makePlayer({ id: 'P1', x: 510, y: 520 });
    const state = makeState({ players: [bot, victim] });
    const arena = makeArena();

    const awareness = buildAwareness(bot, state, arena, Infinity);
    expect(awareness.stompTarget).not.toBeNull();
    expect(awareness.stompTarget!.x).toBe(510);
  });

  it('detects stomp threat above', () => {
    const bot = makePlayer({ id: 'B1', x: 500, y: 628 });
    const threat = makePlayer({ id: 'P1', x: 510, y: 500, vy: 200, state: 'airborne' });
    const state = makeState({ players: [bot, threat] });
    const arena = makeArena();

    const awareness = buildAwareness(bot, state, arena, Infinity);
    expect(awareness.stompThreat).not.toBeNull();
  });

  it('detects hazard zones', () => {
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const state = makeState({ players: [bot] });
    const arena = makeArena({
      hazardZones: [{ x: 250, y: 650, width: 100, height: 20, type: 'lava' }],
    });

    const awareness = buildAwareness(bot, state, arena, Infinity);
    expect(awareness.nearestHazard).not.toBeNull();
    expect(awareness.nearestHazard!.type).toBe('lava');
  });

  it('detects nearby carrot', () => {
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const state = makeState({
      players: [bot],
      carrots: [{ x: 300, y: 620, active: true, spawnTime: 0 }],
    });
    const arena = makeArena();

    const awareness = buildAwareness(bot, state, arena, Infinity);
    expect(awareness.nearestCarrot).not.toBeNull();
    expect(awareness.nearestCarrot!.x).toBe(300);
  });

  it('respects awareness radius', () => {
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const far = makePlayer({ id: 'P1', x: 800, y: 628 });
    const state = makeState({ players: [bot, far] });
    const arena = makeArena();

    const awareness = buildAwareness(bot, state, arena, 250);
    // Enemy at distance ~600 should be outside 250px radius
    expect(awareness.nearestEnemy).toBeNull();
  });


  it('detects ghost as hazard', () => {
    const bot = makePlayer({ id: 'B1', x: 200, y: 500 });
    const state = makeState({
      players: [bot],
      ghosts: [{ x: 250, y: 500, vx: 50, size: 30, alpha: 0.7, wobblePhase: 0 }],
    });
    const arena = makeArena();

    const awareness = buildAwareness(bot, state, arena, Infinity);
    expect(awareness.nearestHazard).not.toBeNull();
    expect(awareness.nearestHazard!.type).toBe('ghost');
  });
});

describe('Utility Scoring', () => {
  it('produces positive moveRight when enemy is to the right', () => {
    const awareness = buildAwareness(
      makePlayer({ id: 'B1', x: 200, y: 628 }),
      makeState({ players: [makePlayer({ id: 'B1', x: 200, y: 628 }), makePlayer({ id: 'P1', x: 800, y: 628 })] }),
      makeArena(),
      Infinity,
    );
    const personality = getPersonality('Fox'); // aggressive
    const scores = evaluateActions(awareness, personality);
    // Net horizontal should favor right
    expect(scores.moveRight - scores.moveLeft).toBeGreaterThan(0);
  });

  it('produces avoidance when hazard is nearby', () => {
    const bot = makePlayer({ id: 'B1', x: 300, y: 628 });
    const arena = makeArena({
      hazardZones: [{ x: 310, y: 650, width: 100, height: 20, type: 'lava' }],
    });
    const state = makeState({ players: [bot] });
    const awareness = buildAwareness(bot, state, arena, Infinity);
    const personality = getPersonality('Bear'); // cautious
    const scores = evaluateActions(awareness, personality);
    // Should want to move left (away from hazard to the right)
    expect(scores.moveLeft).toBeGreaterThan(0);
  });

  it('gives jump when threat above', () => {
    const bot = makePlayer({ id: 'B1', x: 500, y: 628 });
    const threat = makePlayer({ id: 'P1', x: 510, y: 500, vy: 200, state: 'airborne' });
    const state = makeState({ players: [bot, threat] });
    const arena = makeArena();
    const awareness = buildAwareness(bot, state, arena, Infinity);
    const personality = getPersonality('Sheep'); // very cautious
    const scores = evaluateActions(awareness, personality);
    // Should want to jump away
    expect(scores.jump).toBeGreaterThan(0);
  });
});

describe('Personality', () => {
  it('returns known personalities', () => {
    for (const name of ['Bunny', 'Fox', 'Frog', 'Bear', 'Owl', 'Cat', 'Wolf', 'Panda', 'Pig', 'Cow', 'Goat', 'Horse', 'Sheep', 'Monkey']) {
      const p = getPersonality(name);
      expect(p.aggressiveness).toBeGreaterThan(0);
      expect(p.cautiousness).toBeGreaterThan(0);
    }
  });

  it('Wolf targets leader', () => {
    const p = getPersonality('Wolf');
    expect(p.targetLeader).toBe(true);
  });

  it('Monkey has high chaos', () => {
    const p = getPersonality('Monkey');
    expect(p.chaosAffinity).toBeGreaterThanOrEqual(0.8);
  });

  it('Fox is highly aggressive', () => {
    const p = getPersonality('Fox');
    expect(p.aggressiveness).toBeGreaterThan(1.5);
    expect(p.cautiousness).toBeLessThan(0.8);
  });
});

describe('Difficulty', () => {
  it('easy has more reaction delay than hard', () => {
    const easy = getDifficultyParams('easy');
    const hard = getDifficultyParams('hard');
    expect(easy.reactionFrames).toBeGreaterThan(hard.reactionFrames);
  });

  it('hard has widest awareness', () => {
    const hard = getDifficultyParams('hard');
    const medium = getDifficultyParams('medium');
    expect(hard.awarenessRadius).toBeGreaterThan(medium.awarenessRadius);
  });

  it('easy has limited awareness', () => {
    const easy = getDifficultyParams('easy');
    expect(easy.awarenessRadius).toBeLessThan(500);
  });

  it('easy has more noise than hard', () => {
    const easy = getDifficultyParams('easy');
    const hard = getDifficultyParams('hard');
    expect(easy.noiseChance).toBeGreaterThan(hard.noiseChance);
  });
});
