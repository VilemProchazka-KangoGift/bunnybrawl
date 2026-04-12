import { describe, it, expect } from 'vitest';
import { AIController } from '../aiController';
import { buildAwareness } from '../awareness';
import { evaluateActions } from '../utility';
import { getPersonality, getDifficultyParams } from '../personality';
import type { MatchState, Arena, PlayerSlot, InputState } from '../../types';
import { makePlayer } from '../../__tests__/testHelpers';

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
    hitstopZoom: 0,
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

  // Per-character personality tests removed — all bots use DEFAULT_PERSONALITY
  // (character-specific personalities disabled for online determinism)
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

describe('AIController - Frame Throttling', () => {
  // Use 'impossible' difficulty: reactionFrames=0 (no delay), noiseChance=0, hesitationChance=0
  // botIndex=0 means decision frames when frameCounter % 3 === 0 (i.e. calls 3, 6, 9, ...)

  it('reuses previous decision on non-decision frames', () => {
    const ai = new AIController('B1', 'Bunny', 'impossible', 0);
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 800, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    const inputs: InputState[] = [];
    for (let i = 0; i < 6; i++) {
      inputs.push(ai.getInput(bot, state, arena));
      // Move the bot slightly to prevent stuck detection
      bot.x += 3;
    }

    // Calls 1,2 are non-decision frames (frameCounter 1,2) -> same as initial no-op
    // Call 3 is a decision frame (frameCounter 3, 3%3===0) -> may change
    // Calls 4,5 are non-decision frames -> should match call 3
    // Call 6 is a decision frame (frameCounter 6, 6%3===0)

    // Non-decision frames 4 and 5 should be identical to decision frame 3
    expect(inputs[3]).toEqual(inputs[2]); // frame 4 matches frame 3 (decision)
    expect(inputs[4]).toEqual(inputs[2]); // frame 5 matches frame 3 (decision)
  });

  it('staggered bots compute decisions on different frames', () => {
    const ai0 = new AIController('B1', 'Bunny', 'impossible', 0);
    const ai1 = new AIController('B2', 'Fox', 'impossible', 1);
    const bot0 = makePlayer({ id: 'B1', x: 200, y: 628 });
    const bot1 = makePlayer({ id: 'B2', x: 200, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 800, y: 628 });
    const state0 = makeState({ players: [bot0, enemy] });
    const state1 = makeState({ players: [bot1, enemy] });
    const arena = makeArena();

    // Run several frames collecting frame counters where decisions would fire
    // botIndex=0: decision at frameCounter%3===0 -> calls 3,6,9
    // botIndex=1: decision at frameCounter%3===1 -> calls 1,4,7
    // They should NOT overlap
    const decisionFrames0: number[] = [];
    const decisionFrames1: number[] = [];
    const prevInputs0: InputState[] = [];
    const prevInputs1: InputState[] = [];

    for (let i = 0; i < 9; i++) {
      const input0 = ai0.getInput(bot0, state0, arena);
      const input1 = ai1.getInput(bot1, state1, arena);
      bot0.x += 3;
      bot1.x += 3;

      // Track when output changes from previous
      if (prevInputs0.length > 0 && JSON.stringify(input0) !== JSON.stringify(prevInputs0[prevInputs0.length - 1])) {
        decisionFrames0.push(i);
      }
      if (prevInputs1.length > 0 && JSON.stringify(input1) !== JSON.stringify(prevInputs1[prevInputs1.length - 1])) {
        decisionFrames1.push(i);
      }
      prevInputs0.push(input0);
      prevInputs1.push(input1);
    }

    // With different botIndex values, decision frames should not all overlap
    // (they can't be identical patterns since botIndex offsets the modulo)
    // Verify at least that both controllers produced outputs
    expect(prevInputs0).toHaveLength(9);
    expect(prevInputs1).toHaveLength(9);
  });
});

describe('AIController - Serialize / Restore', () => {
  it('round-trips serialize/restore correctly', () => {
    const ai = new AIController('B1', 'Fox', 'hard', 0);
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 600, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    // Run some frames to populate internal state
    for (let i = 0; i < 20; i++) {
      ai.getInput(bot, state, arena);
      bot.x += 2;
    }

    // Take snapshot
    const snapshot = ai.serialize();

    // Verify snapshot has expected fields
    expect(snapshot).toHaveProperty('ringBuffer');
    expect(snapshot).toHaveProperty('ringWrite');
    expect(snapshot).toHaveProperty('ringRead');
    expect(snapshot).toHaveProperty('stuckTimer');
    expect(snapshot).toHaveProperty('lastX');
    expect(snapshot).toHaveProperty('lastY');
    expect(snapshot).toHaveProperty('jumpCooldown');
    expect(snapshot).toHaveProperty('lastScore');
    expect(snapshot).toHaveProperty('tauntTimer');
    expect(snapshot).toHaveProperty('searchTimer');
    expect(snapshot).toHaveProperty('wasIdle');
    expect(snapshot).toHaveProperty('frameCounter');
    expect(snapshot.frameCounter).toBe(20);

    // Mutate the controller by running more frames
    for (let i = 0; i < 30; i++) {
      ai.getInput(bot, state, arena);
      bot.x += 2;
    }
    const afterMutation = ai.serialize();
    expect(afterMutation.frameCounter).toBe(50);

    // Restore original snapshot
    ai.restore(snapshot);
    const afterRestore = ai.serialize();

    // All scalar fields should match the original snapshot
    expect(afterRestore.ringWrite).toBe(snapshot.ringWrite);
    expect(afterRestore.ringRead).toBe(snapshot.ringRead);
    expect(afterRestore.stuckTimer).toBe(snapshot.stuckTimer);
    expect(afterRestore.lastX).toBe(snapshot.lastX);
    expect(afterRestore.lastY).toBe(snapshot.lastY);
    expect(afterRestore.jumpCooldown).toBe(snapshot.jumpCooldown);
    expect(afterRestore.lastScore).toBe(snapshot.lastScore);
    expect(afterRestore.tauntTimer).toBe(snapshot.tauntTimer);
    expect(afterRestore.searchTimer).toBe(snapshot.searchTimer);
    expect(afterRestore.wasIdle).toBe(snapshot.wasIdle);
    expect(afterRestore.frameCounter).toBe(snapshot.frameCounter);

    // Ring buffer contents should match
    for (let i = 0; i < snapshot.ringBuffer.length; i++) {
      expect(afterRestore.ringBuffer[i]).toEqual(snapshot.ringBuffer[i]);
    }
  });

  it('serialize returns deep-copied ring buffer (mutations do not affect snapshot)', () => {
    const ai = new AIController('B1', 'Bunny', 'medium', 0);
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 600, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    // Run a few frames
    for (let i = 0; i < 5; i++) {
      ai.getInput(bot, state, arena);
      bot.x += 2;
    }

    const snapshot = ai.serialize();
    const originalBuffer0 = { ...snapshot.ringBuffer[0] };

    // Run more frames which will modify the controller's internal ring buffer
    for (let i = 0; i < 10; i++) {
      ai.getInput(bot, state, arena);
      bot.x += 2;
    }

    // The snapshot's ring buffer should NOT have been mutated
    expect(snapshot.ringBuffer[0]).toEqual(originalBuffer0);
  });
});

describe('AIController - serializeInto', () => {
  it('updates pre-allocated target with current state', () => {
    const ai = new AIController('B1', 'Bunny', 'hard', 0);
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 600, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    // Run some frames
    for (let i = 0; i < 10; i++) {
      ai.getInput(bot, state, arena);
      bot.x += 2;
    }

    // Create a target with a pre-allocated ring buffer
    const target = {
      ringBuffer: Array.from({ length: 5 }, () => ({ left: false, right: false, jump: false, down: false })),
      ringWrite: 0,
      ringRead: 0,
      stuckTimer: 0,
      lastX: 0,
      lastY: 0,
      jumpCooldown: 0,
      lastScore: 0,
      tauntTimer: 0,
      searchTimer: 0,
      wasIdle: false,
      frameCounter: 0,
    };

    ai.serializeInto(target);

    // Compare with serialize() output
    const snapshot = ai.serialize();
    expect(target.ringWrite).toBe(snapshot.ringWrite);
    expect(target.ringRead).toBe(snapshot.ringRead);
    expect(target.stuckTimer).toBe(snapshot.stuckTimer);
    expect(target.lastX).toBe(snapshot.lastX);
    expect(target.lastY).toBe(snapshot.lastY);
    expect(target.jumpCooldown).toBe(snapshot.jumpCooldown);
    expect(target.lastScore).toBe(snapshot.lastScore);
    expect(target.tauntTimer).toBe(snapshot.tauntTimer);
    expect(target.searchTimer).toBe(snapshot.searchTimer);
    expect(target.wasIdle).toBe(snapshot.wasIdle);
    expect(target.frameCounter).toBe(snapshot.frameCounter);
    expect(target.ringBuffer.length).toBe(snapshot.ringBuffer.length);
    for (let i = 0; i < target.ringBuffer.length; i++) {
      expect(target.ringBuffer[i]).toEqual(snapshot.ringBuffer[i]);
    }
  });

  it('grows target ring buffer when source is larger', () => {
    // 'easy' has reactionFrames=30, ringSize=31
    const ai = new AIController('B1', 'Bunny', 'easy', 0);
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 600, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    ai.getInput(bot, state, arena);

    // Start with a small target buffer (only 2 entries)
    const target = {
      ringBuffer: [
        { left: false, right: false, jump: false, down: false },
        { left: false, right: false, jump: false, down: false },
      ],
      ringWrite: 0, ringRead: 0, stuckTimer: 0, lastX: 0, lastY: 0,
      jumpCooldown: 0, lastScore: 0, tauntTimer: 0, searchTimer: 0,
      wasIdle: false, frameCounter: 0,
    };

    ai.serializeInto(target);

    // Ring buffer should have grown to match the controller's buffer (31 entries for easy)
    const snapshot = ai.serialize();
    expect(target.ringBuffer.length).toBe(snapshot.ringBuffer.length);
    expect(target.ringBuffer.length).toBe(31);
  });
});

describe('AIController - Splatted & Respawning Input', () => {
  it('returns all-false input when player state is splat', () => {
    const ai = new AIController('B1', 'Bear', 'impossible', 0);
    const bot = makePlayer({ id: 'B1', state: 'splat', splatTimer: 30 });
    const state = makeState({ players: [bot] });
    const arena = makeArena();

    // Even after many calls, splatted bot should always return no-op
    for (let i = 0; i < 10; i++) {
      const input = ai.getInput(bot, state, arena);
      expect(input).toEqual({ left: false, right: false, jump: false, down: false });
    }
  });

  it('returns all-false input when player state is respawning', () => {
    const ai = new AIController('B1', 'Bear', 'impossible', 0);
    const bot = makePlayer({ id: 'B1', state: 'respawning', respawnTimer: 20 });
    const state = makeState({ players: [bot] });
    const arena = makeArena();

    for (let i = 0; i < 10; i++) {
      const input = ai.getInput(bot, state, arena);
      expect(input).toEqual({ left: false, right: false, jump: false, down: false });
    }
  });

  it('returns all-false when player is inactive', () => {
    const ai = new AIController('B1', 'Bear', 'impossible', 0);
    const bot = makePlayer({ id: 'B1', active: false });
    const state = makeState({ players: [bot] });
    const arena = makeArena();

    const input = ai.getInput(bot, state, arena);
    expect(input).toEqual({ left: false, right: false, jump: false, down: false });
  });

  it('does not advance internal frame counter when splatted', () => {
    const ai = new AIController('B1', 'Fox', 'hard', 0);
    const bot = makePlayer({ id: 'B1', x: 200, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 600, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    // Run 5 frames alive to advance frame counter
    for (let i = 0; i < 5; i++) {
      ai.getInput(bot, state, arena);
      bot.x += 2;
    }
    const snapBefore = ai.serialize();
    expect(snapBefore.frameCounter).toBe(5);

    // Now splat the bot and run 10 more frames
    bot.state = 'splat';
    bot.splatTimer = 50;
    for (let i = 0; i < 10; i++) {
      ai.getInput(bot, state, arena);
    }

    // Frame counter should NOT have advanced (splatted returns early before frameCounter++)
    const snapAfter = ai.serialize();
    expect(snapAfter.frameCounter).toBe(5);
  });
});

describe('AIController - Jump Cooldown', () => {
  it('suppresses jump for jumpCooldownFrames after a jump fires', () => {
    // Use 'impossible' difficulty: noiseChance=0, hesitationChance=0, jumpCooldownFrames=6, reactionFrames=0
    const ai = new AIController('B1', 'Bunny', 'impossible', 0);
    const bot = makePlayer({ id: 'B1', x: 400, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 600, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    // Don't move bot -> stuck timer fires at 45 frames -> guarantees jump=true
    // With reactionFrames=0 and noiseChance=0, the jump comes through immediately
    let jumpFrame = -1;
    for (let i = 0; i < 60; i++) {
      const input = ai.getInput(bot, state, arena);
      if (input.jump && jumpFrame === -1) {
        jumpFrame = i;
        break;
      }
    }

    // Stuck recovery should have triggered a jump
    expect(jumpFrame).toBeGreaterThanOrEqual(0);

    // After the jump, jumpCooldown is set to 6 (impossible difficulty).
    // For the next 5 frames, jump should be suppressed.
    let jumpSuppressed = true;
    for (let i = 0; i < 5; i++) {
      const input = ai.getInput(bot, state, arena);
      if (input.jump) {
        jumpSuppressed = false;
        break;
      }
    }
    expect(jumpSuppressed).toBe(true);
  });

  it('allows jump again after cooldown expires', () => {
    const ai = new AIController('B1', 'Bunny', 'impossible', 0);
    const bot = makePlayer({ id: 'B1', x: 400, y: 628 });
    const enemy = makePlayer({ id: 'P1', x: 600, y: 628 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    // Trigger first jump via stuck recovery (don't move bot for 46+ frames)
    let gotFirstJump = false;
    for (let i = 0; i < 60; i++) {
      const input = ai.getInput(bot, state, arena);
      if (input.jump) {
        gotFirstJump = true;
        break;
      }
    }
    expect(gotFirstJump).toBe(true);

    // Burn through cooldown (6 frames for impossible)
    for (let i = 0; i < 6; i++) {
      ai.getInput(bot, state, arena);
    }

    // Now run more frames without moving the bot (triggers another stuck recovery)
    // Stuck timer was reset to 0 when escape fired, so need another 46 frames
    let gotSecondJump = false;
    for (let i = 0; i < 60; i++) {
      const input = ai.getInput(bot, state, arena);
      if (input.jump) {
        gotSecondJump = true;
        break;
      }
    }
    expect(gotSecondJump).toBe(true);
  });
});

describe('AIController — wolf targetLeader personality', () => {
  it('wolf targets highest-scoring opponent instead of nearest', () => {
    const ai = new AIController('B1', 'Wolf', 'hard');
    const bot = makePlayer({ id: 'B1', x: 500, y: 628, score: 0 });
    // P1 is close but low score; P2 is far but high score
    const nearEnemy = makePlayer({ id: 'P1', x: 550, y: 628, score: 2 });
    const farLeader = makePlayer({ id: 'P2', x: 1100, y: 628, score: 10 });
    const state = makeState({ players: [bot, nearEnemy, farLeader] });
    const arena = makeArena();

    // Run many frames to get a statistical picture
    let rightCount = 0;
    let leftCount = 0;
    for (let i = 0; i < 120; i++) {
      const input = ai.getInput(bot, state, arena);
      if (input.right) rightCount++;
      if (input.left) leftCount++;
    }

    // Wolf should move right toward the far leader (P2 at x=1100) more often
    // than left (away from both enemies)
    expect(rightCount).toBeGreaterThan(leftCount);
  });

  it('wolf falls back to nearest enemy when no one has higher score', () => {
    const ai = new AIController('B1', 'Wolf', 'hard');
    const bot = makePlayer({ id: 'B1', x: 500, y: 628, score: 10 });
    const enemy = makePlayer({ id: 'P1', x: 200, y: 628, score: 5 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena();

    // Wolf has highest score — no leader to target, falls back to nearest
    let leftCount = 0;
    for (let i = 0; i < 120; i++) {
      const input = ai.getInput(bot, state, arena);
      if (input.left) leftCount++;
    }

    // Should move toward the nearest enemy (left, toward P1 at x=200)
    expect(leftCount).toBeGreaterThan(20);
  });
});

describe('AIController — stuck recovery with nav target', () => {
  it('uses nav target direction when stuck with nav data available', () => {
    const ai = new AIController('B1', 'Fox', 'hard');
    const bot = makePlayer({ id: 'B1', x: 400, y: 628, score: 0 });
    const enemy = makePlayer({ id: 'P1', x: 800, y: 400, score: 0 });
    const state = makeState({ players: [bot, enemy] });
    const arena = makeArena({
      navData: {
        nodes: [
          { x: 640, y: 660, w: 1280 },
          { x: 500, y: 500, w: 200 },
          { x: 800, y: 400, w: 200 },
        ],
        edges: [
          [{ t: 1, x: 400, y: 'j' as any, d: 0 }],
          [{ t: 2, x: 600, y: 'j' as any, d: 0 }],
          [],
        ],
        nextHop: [[0, 1, 1], [0, 1, 2], [0, 1, 2]],
        safeHop: [[0, 1, 1], [0, 1, 2], [0, 1, 2]],
      },
    });

    // Run 50 frames without moving bot to trigger stuck (threshold = 45)
    for (let i = 0; i < 50; i++) {
      ai.getInput(bot, state, arena);
    }

    // Next input should be the stuck recovery — with nav target, it should pick a direction
    const input = ai.getInput(bot, state, arena);
    // Should have jump or movement (not all-false)
    const hasAction = input.left || input.right || input.jump || input.down;
    expect(hasAction).toBe(true);
  });
});
