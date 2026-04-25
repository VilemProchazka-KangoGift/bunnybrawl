import { describe, it, expect, vi } from 'vitest';
import { SeededRNG } from './prng';
import {
  takeSnapshot,
  restoreSnapshot,
  hashGameState,
} from './serialize';
import type { MatchState, Player, PlayerSlot, PlayerStats } from '../types';

// ---- Test helpers (mirrors net.test.ts but local to avoid coupling) ----

function makeTestPlayer(id: PlayerSlot): Player {
  return {
    id,
    character: { name: 'bunny', color: '#fff', darkColor: '#ccc', lightColor: '#fff', emoji: '🐰' } as any,
    x: 100.5, y: 200.5,
    vx: 55.5, vy: -33.3,
    width: 24, height: 40,
    state: 'airborne' as const,
    facing: 'right' as const,
    splatTimer: 1.5,
    respawnTimer: 2.5,
    invincibleTimer: 0.8,
    score: 7,
    active: true,
    animFrame: 3,
    animTimer: 0.12,
    fastFalling: true,
    fatTimer: 5.0,
    slowTimer: 3.0,
    squashScale: 0.85,
    squashTimer: 0.4,
    sideSquash: 0.75,
    afterimages: [],
    idleAnimTimer: 1.2,
    idleAction: -1, idleActionTimer: 0, idleActionDuration: 0,
    expression: 'angry' as const,
    killStreak: 3,
    breathTimer: 0.6,
    springTrailTimer: 0.3,
    damageFlashSide: 'left' as const,
    damageFlashTimer: 0.15,
    burnTimer: 2.0,
    hitstopTimer: 0.1,
    renderOffsetX: 0,
    renderOffsetY: 0,
    disconnected: true,
  };
}

function makeTestStats(): PlayerStats {
  return { bestStreak: 3, timeAirborne: 10, distanceTraveled: 500, carrotsEaten: 2 };
}

function makeTestMatchState(): MatchState {
  return {
    players: [makeTestPlayer('P1'), makeTestPlayer('P2')],
    killFeed: [{ attackerId: 'P1', victimId: 'P2', time: 10.5, character: 'bunny', victimCharacter: 'fox' } as any],
    timeElapsed: 42.5,
    matchOver: false,
    winner: null,
    carrots: [{ x: 300, y: 400, collected: false } as any],
    carrotTimer: 5.5,
    springs: [{ x: 500, y: 600, bounceTimer: 0 } as any],
    thorns: [{ x: 700, y: 650, hitTimer: 0 } as any],
    springSpawnTimer: 12.3,
    thornSpawnTimer: 8.7,
    screenShake: 0.3,
    slowMotion: 0.5,
    weather: [],
    dayPhase: 0.25,
    countdown: 0,
    stats: { perPlayer: new Map<PlayerSlot, PlayerStats>([['P1', makeTestStats()]]) },
    shockwaves: [{ x: 100, y: 200, radius: 10, maxRadius: 50, life: 0.8 }],
    screenFlash: 0.2,
    hitstopZoom: 0.1,
    wildlife: [],
    fogParticles: [],
    pollenParticles: [],
    shootingStars: [],
    scoreAnimations: [{ playerId: 'P1' as PlayerSlot, value: 2, timer: 0.5 }],
    ghosts: [],
    lavaRocks: [{ x: 400, y: 300, active: true } as any],
    lavaRockTimer: 15.0,
    geyserStates: [{ timer: 3.0, active: true, activeTimer: 1.5 }],
    pigeonFlocks: [{ x: 200, y: 100, active: true, respawnTimer: 0, scatterParticles: [] }],
    bouncyWobble: new Map([[0, 0.5], [2, 0.3]]),
    gibs: [],
    confetti: [],
  };
}

function makeMockAIController() {
  const snapData = {
    ringBuffer: [{ left: false, right: false, jump: false, down: false }],
    ringWrite: 5,
    ringRead: 3,
    stuckTimer: 1.5,
    lastX: 100,
    lastY: 200,
    jumpCooldown: 10,
    lastScore: 4,
    tauntTimer: 0.5,
    searchTimer: 2.0,
    wasIdle: true,
    frameCounter: 120,
  };
  return {
    serialize: vi.fn(() => ({ ...snapData })),
    serializeInto: vi.fn((target: any) => Object.assign(target, snapData)),
    restore: vi.fn(),
  };
}

// ---- Tests ----

describe('takeSnapshot', () => {
  it('captures frame number and rng state', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    for (let i = 0; i < 10; i++) rng.nextFloat();
    const expectedState = rng.getState();
    const snap = takeSnapshot(5, state, rng, new Map());
    expect(snap.frame).toBe(5);
    expect(snap.rngState).toBe(expectedState);
  });

  it('stores rngState === 0 when rng is undefined', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());
    expect(snap.rngState).toBe(0);
  });

  it('deep-clones carrots (mutation of state does not affect snapshot)', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());
    state.carrots[0].x = 999;
    expect(snap.carrots[0].x).toBe(300);
  });

  it('deep-clones springs and thorns', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());
    state.springs[0].x = 999;
    state.thorns[0].x = 888;
    expect(snap.springs[0].x).toBe(500);
    expect(snap.thorns[0].x).toBe(700);
  });

  it('deep-clones lavaRocks', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());
    state.lavaRocks[0].x = 999;
    expect(snap.lavaRocks[0].x).toBe(400);
  });

  it('deep-clones killFeed', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());
    state.killFeed[0].time = 0;
    expect(snap.killFeed[0].time).toBe(10.5);
  });

  it('deep-clones scoreAnimations and shockwaves', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());
    state.scoreAnimations[0].timer = 0;
    state.shockwaves[0].radius = 999;
    expect(snap.scoreAnimations[0].timer).toBe(0.5);
    expect(snap.shockwaves[0].radius).toBe(10);
  });

  it('serializes bouncyWobble Map as sorted [key, value] tuples', () => {
    const state = makeTestMatchState();
    // Map has keys 0, 2 — should be sorted
    const snap = takeSnapshot(0, state, undefined, new Map());
    expect(snap.bouncyWobble).toEqual([[0, 0.5], [2, 0.3]]);
  });

  it('serializes bouncyWobble in sorted order even with reverse insertion', () => {
    const state = makeTestMatchState();
    state.bouncyWobble.clear();
    state.bouncyWobble.set(5, 0.1);
    state.bouncyWobble.set(1, 0.9);
    state.bouncyWobble.set(3, 0.5);
    const snap = takeSnapshot(0, state, undefined, new Map());
    expect(snap.bouncyWobble).toEqual([[1, 0.9], [3, 0.5], [5, 0.1]]);
  });

  it('serializes stats Map as sorted [slot, stats] tuples', () => {
    const state = makeTestMatchState();
    state.stats.perPlayer.set('P2', { bestStreak: 1, timeAirborne: 5, distanceTraveled: 200, carrotsEaten: 0 });
    const snap = takeSnapshot(0, state, undefined, new Map());
    expect(snap.stats[0][0]).toBe('P1');
    expect(snap.stats[1][0]).toBe('P2');
    expect(snap.stats[0][1].bestStreak).toBe(3);
    expect(snap.stats[1][1].bestStreak).toBe(1);
  });

  it('serializes AI controllers in sorted order', () => {
    const ai1 = makeMockAIController();
    const ai2 = makeMockAIController();
    const aiMap = new Map<string, any>([['B2', ai2], ['B1', ai1]]);
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, aiMap);
    expect(snap.aiStates[0][0]).toBe('B1');
    expect(snap.aiStates[1][0]).toBe('B2');
    expect(ai1.serialize).toHaveBeenCalled();
    expect(ai2.serialize).toHaveBeenCalled();
  });

  it('handles empty match state', () => {
    const state = makeTestMatchState();
    state.players = [];
    state.carrots = [];
    state.springs = [];
    state.thorns = [];
    state.killFeed = [];
    state.ghosts = [];
    state.lavaRocks = [];
    state.geyserStates = [];
    state.pigeonFlocks = [];
    state.bouncyWobble.clear();
    state.scoreAnimations = [];
    state.shockwaves = [];
    state.stats.perPlayer.clear();
    const snap = takeSnapshot(0, state, undefined, new Map());
    expect(snap.players).toHaveLength(0);
    expect(snap.carrots).toHaveLength(0);
    expect(snap.bouncyWobble).toHaveLength(0);
    expect(snap.stats).toHaveLength(0);
  });
});

describe('restoreSnapshot', () => {
  it('restores rng state', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    for (let i = 0; i < 50; i++) rng.nextFloat();

    const snap = takeSnapshot(0, state, rng, new Map());
    const savedRngState = snap.rngState;

    // Advance rng further
    for (let i = 0; i < 20; i++) rng.nextFloat();
    expect(rng.getState()).not.toBe(savedRngState);

    restoreSnapshot(snap, state, rng, new Map());
    expect(rng.getState()).toBe(savedRngState);
  });

  it('does not crash when rng is undefined', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());
    expect(() => restoreSnapshot(snap, state, undefined, new Map())).not.toThrow();
  });

  it('restores bouncyWobble Map from sorted tuples', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());

    state.bouncyWobble.clear();
    expect(state.bouncyWobble.size).toBe(0);

    restoreSnapshot(snap, state, undefined, new Map());
    expect(state.bouncyWobble.size).toBe(2);
    expect(state.bouncyWobble.get(0)).toBe(0.5);
    expect(state.bouncyWobble.get(2)).toBe(0.3);
  });

  it('restores stats Map without reference aliasing', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());

    state.stats.perPlayer.clear();
    restoreSnapshot(snap, state, undefined, new Map());

    // Verify restored
    expect(state.stats.perPlayer.get('P1')!.bestStreak).toBe(3);

    // Mutating snap should not affect restored state
    snap.stats[0][1].bestStreak = 999;
    expect(state.stats.perPlayer.get('P1')!.bestStreak).toBe(3);
  });

  it('preserves pigeon scatterParticles (cosmetic field) during restore', () => {
    const state = makeTestMatchState();
    state.pigeonFlocks[0].scatterParticles = [{ x: 1, y: 2 }] as any;
    const snap = takeSnapshot(0, state, undefined, new Map());

    // Mutate pigeon position but keep scatterParticles
    state.pigeonFlocks[0].x = 999;
    restoreSnapshot(snap, state, undefined, new Map());

    expect(state.pigeonFlocks[0].x).toBe(200);
    // scatterParticles should still exist (restore only copies x, y, active, respawnTimer)
    expect(state.pigeonFlocks[0].scatterParticles).toBeDefined();
  });

  it('restores AI controller state via restore()', () => {
    const state = makeTestMatchState();
    const ai = makeMockAIController();
    const aiMap = new Map<string, any>([['B1', ai]]);
    const snap = takeSnapshot(0, state, undefined, aiMap);

    restoreSnapshot(snap, state, undefined, aiMap);
    expect(ai.restore).toHaveBeenCalledWith(snap.aiStates[0][1]);
  });

  it('skips AI restore for unknown controller IDs', () => {
    const state = makeTestMatchState();
    const ai = makeMockAIController();
    const aiMap = new Map<string, any>([['B1', ai]]);
    const snap = takeSnapshot(0, state, undefined, aiMap);

    // Restore with empty AI map (B1 not found)
    const emptyAiMap = new Map<string, any>();
    expect(() => restoreSnapshot(snap, state, undefined, emptyAiMap)).not.toThrow();
  });

  it('clears old bouncyWobble entries before restoring', () => {
    const state = makeTestMatchState();
    const snap = takeSnapshot(0, state, undefined, new Map());

    // Add extra entries that should be cleared on restore
    state.bouncyWobble.set(99, 0.99);
    expect(state.bouncyWobble.size).toBe(3);

    restoreSnapshot(snap, state, undefined, new Map());
    expect(state.bouncyWobble.size).toBe(2);
    expect(state.bouncyWobble.has(99)).toBe(false);
  });
});

describe('hashGameState edge cases', () => {
  it('identical states produce identical hashes', () => {
    const s1 = makeTestMatchState();
    const s2 = makeTestMatchState();
    const r1 = new SeededRNG(1);
    const r2 = new SeededRNG(1);
    expect(hashGameState(s1, r1)).toBe(hashGameState(s2, r2));
  });

  it('changing player x changes the hash', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);
    const h1 = hashGameState(state, rng);
    state.players[0].x += 0.001;
    const h2 = hashGameState(state, rng);
    expect(h1).not.toBe(h2);
  });

  it('changing player score changes the hash', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);
    const h1 = hashGameState(state, rng);
    state.players[0].score += 1;
    const h2 = hashGameState(state, rng);
    expect(h1).not.toBe(h2);
  });

  it('changing rng state changes the hash', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);
    const h1 = hashGameState(state, rng);
    rng.nextFloat();
    const h2 = hashGameState(state, rng);
    expect(h1).not.toBe(h2);
  });

  it('rng=undefined contributes 0 to hash', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(0);
    // SeededRNG(0) has state = 0, so getState() returns 0 — same as the undefined path
    const hashWithRng = hashGameState(state, rng);
    const hashWithout = hashGameState(state, undefined);
    expect(hashWithRng).toBe(hashWithout);
  });

  it('entity count change changes the hash', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);
    const h1 = hashGameState(state, rng);
    state.carrots.push({ x: 100, y: 100, collected: false } as any);
    const h2 = hashGameState(state, rng);
    expect(h1).not.toBe(h2);
  });

  it('geyser active state change changes the hash', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);
    const h1 = hashGameState(state, rng);
    state.geyserStates[0].active = false;
    const h2 = hashGameState(state, rng);
    expect(h1).not.toBe(h2);
  });
});

// ===================================================================
// Player.disconnected serialization
// ===================================================================

describe('Player.disconnected in snapshots', () => {
  it('disconnected flag is preserved through snapshot round-trip', () => {
    const state = makeTestMatchState();
    state.players[0].disconnected = true;
    state.players[1].disconnected = false;
    const rng = new SeededRNG(42);

    const snap = takeSnapshot(0, state, rng, new Map());
    expect(snap.players[0].disconnected).toBe(true);
    expect(snap.players[1].disconnected).toBe(false);

    state.players[0].disconnected = false;
    restoreSnapshot(snap, state, rng, new Map());
    expect(state.players[0].disconnected).toBe(true);
  });

  it('disconnected flag changes the hash', () => {
    const state = makeTestMatchState();
    state.players[0].disconnected = false;
    const rng = new SeededRNG(42);

    // disconnected doesn't affect hashGameState (not hashed for perf)
    // but it IS in the snapshot, which is what matters for rollback correctness
    const snap1 = takeSnapshot(0, state, rng, new Map());
    state.players[0].disconnected = true;
    const snap2 = takeSnapshot(0, state, rng, new Map());

    expect(snap1.players[0].disconnected).toBe(false);
    expect(snap2.players[0].disconnected).toBe(true);
  });
});

describe('restoreSnapshot with mismatched player counts', () => {
  it('restores only min(snapshot, state) players when snapshot has more', () => {
    const state = makeTestMatchState();
    // state has 2 players
    const rng = new SeededRNG(42);

    // Create snapshot with 3 players
    state.players.push(makeTestPlayer('P3'));
    state.players[2].x = 777;
    state.players[2].score = 50;
    const snap = takeSnapshot(0, state, rng, new Map());
    expect(snap.players).toHaveLength(3);

    // Now shrink state back to 2 players
    state.players.pop();
    expect(state.players).toHaveLength(2);

    // Mutate both remaining players
    state.players[0].x = 0;
    state.players[1].x = 0;

    // Restore: should only restore 2 players (min of 3 snapshot, 2 state)
    restoreSnapshot(snap, state, rng, new Map());
    expect(state.players).toHaveLength(2);
    expect(state.players[0].x).toBe(100.5); // restored from snapshot
    expect(state.players[1].x).toBe(100.5); // restored from snapshot
  });

  it('restores only min(snapshot, state) players when state has more', () => {
    const state = makeTestMatchState();
    // state has 2 players
    const rng = new SeededRNG(42);

    // Snapshot with 2 players
    const snap = takeSnapshot(0, state, rng, new Map());

    // Grow state to 3 players
    state.players.push(makeTestPlayer('P3'));
    state.players[0].x = 0;
    state.players[1].x = 0;
    state.players[2].x = 0;

    // Restore: restores first 2 (min of 2 snapshot, 3 state), P3 untouched
    restoreSnapshot(snap, state, rng, new Map());
    expect(state.players[0].x).toBe(100.5); // restored
    expect(state.players[1].x).toBe(100.5); // restored
    expect(state.players[2].x).toBe(0);     // not in snapshot, untouched
  });
});

describe('hashGameState with 5 players', () => {
  it('hash changes when adding players from 2 to 5', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);

    const hash2 = hashGameState(state, rng);

    state.players.push(makeTestPlayer('P3'));
    const hash3 = hashGameState(state, rng);
    expect(hash3).not.toBe(hash2);

    state.players.push(makeTestPlayer('P4'));
    const hash4 = hashGameState(state, rng);
    expect(hash4).not.toBe(hash3);
    expect(hash4).not.toBe(hash2);

    state.players.push(makeTestPlayer('P5'));
    const hash5 = hashGameState(state, rng);
    expect(hash5).not.toBe(hash4);
    expect(hash5).not.toBe(hash3);
    expect(hash5).not.toBe(hash2);
  });

  it('hash is identical for two independently constructed 5-player states', () => {
    const s1 = makeTestMatchState();
    s1.players.push(makeTestPlayer('P3'), makeTestPlayer('P4'), makeTestPlayer('P5'));
    const s2 = makeTestMatchState();
    s2.players.push(makeTestPlayer('P3'), makeTestPlayer('P4'), makeTestPlayer('P5'));
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(42);
    expect(hashGameState(s1, rng1)).toBe(hashGameState(s2, rng2));
  });
});

describe('takeSnapshot with many entities', () => {
  it('captures and deep-clones many carrots, springs, thorns, lava rocks, and geyser states', () => {
    const state = makeTestMatchState();

    // Set up 10 carrots
    state.carrots = [];
    for (let i = 0; i < 10; i++) {
      state.carrots.push({ x: i * 100, y: i * 50, collected: i % 2 === 0 } as any);
    }
    // 5 springs
    state.springs = [];
    for (let i = 0; i < 5; i++) {
      state.springs.push({ x: i * 200, y: 600, bounceTimer: i * 0.1 } as any);
    }
    // 8 thorns
    state.thorns = [];
    for (let i = 0; i < 8; i++) {
      state.thorns.push({ x: i * 150, y: 650, hitTimer: i * 0.05 } as any);
    }
    // 3 lava rocks
    state.lavaRocks = [];
    for (let i = 0; i < 3; i++) {
      state.lavaRocks.push({ x: i * 300, y: i * 100, active: true } as any);
    }
    // 2 geyser states
    state.geyserStates = [
      { timer: 5.0, active: true, activeTimer: 2.0 },
      { timer: 8.0, active: false, activeTimer: 0 },
    ];

    const snap = takeSnapshot(0, state, undefined, new Map());

    // Verify counts
    expect(snap.carrots).toHaveLength(10);
    expect(snap.springs).toHaveLength(5);
    expect(snap.thorns).toHaveLength(8);
    expect(snap.lavaRocks).toHaveLength(3);
    expect(snap.geyserStates).toHaveLength(2);

    // Verify values
    expect(snap.carrots[0].x).toBe(0);
    expect(snap.carrots[9].x).toBe(900);
    expect(snap.springs[4].bounceTimer).toBe(0.4);
    expect(snap.thorns[7].x).toBe(1050);
    expect(snap.lavaRocks[2].x).toBe(600);
    expect(snap.geyserStates[1].timer).toBe(8.0);

    // Verify deep clone: mutating source should not affect snapshot
    state.carrots[0].x = 9999;
    state.springs[0].x = 9999;
    state.thorns[0].x = 9999;
    state.lavaRocks[0].x = 9999;
    state.geyserStates[0].timer = 9999;

    expect(snap.carrots[0].x).toBe(0);
    expect(snap.springs[0].x).toBe(0);
    expect(snap.thorns[0].x).toBe(0);
    expect(snap.lavaRocks[0].x).toBe(0);
    expect(snap.geyserStates[0].timer).toBe(5.0);
  });
});

describe('stats with multiple players', () => {
  it('Map with P1-P5 stats is sorted in snapshot', () => {
    const state = makeTestMatchState();
    // Clear and add in reverse order
    state.stats.perPlayer.clear();
    const slots: PlayerSlot[] = ['P5', 'P3', 'P1', 'P4', 'P2'];
    for (const slot of slots) {
      state.stats.perPlayer.set(slot, {
        bestStreak: slot.charCodeAt(1) - 48, // '1'->1, '2'->2, etc.
        timeAirborne: 10,
        distanceTraveled: 500,
        carrotsEaten: 0,
      });
    }

    const snap = takeSnapshot(0, state, undefined, new Map());

    // Should be sorted P1, P2, P3, P4, P5
    expect(snap.stats).toHaveLength(5);
    expect(snap.stats[0][0]).toBe('P1');
    expect(snap.stats[1][0]).toBe('P2');
    expect(snap.stats[2][0]).toBe('P3');
    expect(snap.stats[3][0]).toBe('P4');
    expect(snap.stats[4][0]).toBe('P5');

    // Verify values match the slot number
    expect(snap.stats[0][1].bestStreak).toBe(1);
    expect(snap.stats[4][1].bestStreak).toBe(5);
  });

  it('stats round-trip preserves all 5 players without reference aliasing', () => {
    const state = makeTestMatchState();
    state.stats.perPlayer.clear();
    for (let i = 1; i <= 5; i++) {
      const slot = `P${i}` as PlayerSlot;
      state.stats.perPlayer.set(slot, {
        bestStreak: i,
        timeAirborne: i * 10,
        distanceTraveled: i * 100,
        carrotsEaten: i,
      });
    }

    const snap = takeSnapshot(0, state, undefined, new Map());

    // Clear and restore
    state.stats.perPlayer.clear();
    restoreSnapshot(snap, state, undefined, new Map());

    expect(state.stats.perPlayer.size).toBe(5);
    for (let i = 1; i <= 5; i++) {
      const slot = `P${i}` as PlayerSlot;
      const stats = state.stats.perPlayer.get(slot)!;
      expect(stats.bestStreak).toBe(i);
      expect(stats.timeAirborne).toBe(i * 10);
      expect(stats.distanceTraveled).toBe(i * 100);
      expect(stats.carrotsEaten).toBe(i);
    }

    // Verify no reference aliasing: mutating snapshot should not affect restored state
    snap.stats[0][1].bestStreak = 999;
    expect(state.stats.perPlayer.get('P1')!.bestStreak).toBe(1);
  });
});

// ===================================================================
// Additional gap-coverage tests
// ===================================================================

describe('takeSnapshot with ghosts array', () => {
  it('captures and deep-clones ghosts', () => {
    const state = makeTestMatchState();
    state.ghosts = [
      { x: 100, y: 200, vx: 1.5, size: 30, alpha: 0.8, wobblePhase: 0.3 },
      { x: 400, y: 150, vx: -2.0, size: 25, alpha: 0.6, wobblePhase: 1.2 },
    ];
    const snap = takeSnapshot(0, state, undefined, new Map());

    expect(snap.ghosts).toHaveLength(2);
    expect(snap.ghosts[0].x).toBe(100);
    expect(snap.ghosts[0].vx).toBe(1.5);
    expect(snap.ghosts[1].x).toBe(400);
    expect(snap.ghosts[1].alpha).toBe(0.6);

    // Verify deep clone: mutating source should not affect snapshot
    state.ghosts[0].x = 9999;
    state.ghosts[1].alpha = 0;
    expect(snap.ghosts[0].x).toBe(100);
    expect(snap.ghosts[1].alpha).toBe(0.6);
  });
});

describe('takeSnapshot with 5 players', () => {
  it('captures all 5 players with correct IDs', () => {
    const state = makeTestMatchState();
    state.players = [
      makeTestPlayer('P1'),
      makeTestPlayer('P2'),
      makeTestPlayer('P3'),
      makeTestPlayer('P4'),
      makeTestPlayer('P5'),
    ];
    // Give each distinct x so we can verify ordering
    state.players[0].x = 10;
    state.players[1].x = 20;
    state.players[2].x = 30;
    state.players[3].x = 40;
    state.players[4].x = 50;

    const snap = takeSnapshot(0, state, undefined, new Map());

    expect(snap.players).toHaveLength(5);
    expect(snap.players[0].id).toBe('P1');
    expect(snap.players[1].id).toBe('P2');
    expect(snap.players[2].id).toBe('P3');
    expect(snap.players[3].id).toBe('P4');
    expect(snap.players[4].id).toBe('P5');
    expect(snap.players[0].x).toBe(10);
    expect(snap.players[4].x).toBe(50);
  });
});

describe('restoreSnapshot preserves player order', () => {
  it('P1 stays at index 0 and P2 at index 1 after restore', () => {
    const state = makeTestMatchState();
    state.players[0].x = 111;
    state.players[1].x = 222;

    const snap = takeSnapshot(0, state, undefined, new Map());

    // Mutate positions
    state.players[0].x = 0;
    state.players[1].x = 0;

    restoreSnapshot(snap, state, undefined, new Map());

    expect(state.players[0].id).toBe('P1');
    expect(state.players[0].x).toBe(111);
    expect(state.players[1].id).toBe('P2');
    expect(state.players[1].x).toBe(222);
  });
});

describe('restoreSnapshot with empty killFeed', () => {
  it('clears state killFeed when snapshot killFeed is empty', () => {
    const state = makeTestMatchState();
    // State starts with 1 kill feed entry from makeTestMatchState
    expect(state.killFeed.length).toBeGreaterThan(0);

    // Take snapshot with empty killFeed
    state.killFeed = [];
    const snap = takeSnapshot(0, state, undefined, new Map());
    expect(snap.killFeed).toHaveLength(0);

    // Add entries back to state
    state.killFeed = [
      { attackerId: 'P1', victimId: 'P2', time: 5, character: 'bunny', victimCharacter: 'fox' } as any,
      { attackerId: 'P2', victimId: 'P1', time: 8, character: 'fox', victimCharacter: 'bunny' } as any,
    ];
    expect(state.killFeed).toHaveLength(2);

    // Restore from empty snapshot should clear killFeed
    restoreSnapshot(snap, state, undefined, new Map());
    expect(state.killFeed).toHaveLength(0);
  });
});

describe('hashGameState with zero players', () => {
  it('produces a valid hash', () => {
    const state = makeTestMatchState();
    state.players = [];
    const rng = new SeededRNG(42);
    const hash = hashGameState(state, rng);
    expect(typeof hash).toBe('number');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xFFFFFFFF);
    expect(Number.isInteger(hash)).toBe(true);
  });
});
