import { describe, it, expect, vi } from 'vitest';
import { SeededRNG } from './prng';
import {
  createEmptySnapshot,
  takeSnapshot,
  takeSnapshotInto,
  restoreSnapshot,
  crc32,
  hashGameState,
  hashGameStateDetailed,
  hashSnapshot,
} from './serialize';
import type { GameSnapshot } from './serialize';
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

describe('createEmptySnapshot', () => {
  it('returns a snapshot with frame === -1', () => {
    const snap = createEmptySnapshot();
    expect(snap.frame).toBe(-1);
  });

  it('returns zero for all numeric fields', () => {
    const snap = createEmptySnapshot();
    expect(snap.rngState).toBe(0);
    expect(snap.timeElapsed).toBe(0);
    expect(snap.carrotTimer).toBe(0);
    expect(snap.springSpawnTimer).toBe(0);
    expect(snap.thornSpawnTimer).toBe(0);
    expect(snap.lavaRockTimer).toBe(0);
    expect(snap.screenShake).toBe(0);
    expect(snap.slowMotion).toBe(0);
    expect(snap.screenFlash).toBe(0);
    expect(snap.hitstopZoom).toBe(0);
    expect(snap.dayPhase).toBe(0);
    expect(snap.countdown).toBe(0);
  });

  it('returns empty arrays for all array fields', () => {
    const snap = createEmptySnapshot();
    expect(snap.players).toHaveLength(0);
    expect(snap.killFeed).toHaveLength(0);
    expect(snap.carrots).toHaveLength(0);
    expect(snap.springs).toHaveLength(0);
    expect(snap.thorns).toHaveLength(0);
    expect(snap.ghosts).toHaveLength(0);
    expect(snap.lavaRocks).toHaveLength(0);
    expect(snap.geyserStates).toHaveLength(0);
    expect(snap.pigeonFlocks).toHaveLength(0);
    expect(snap.bouncyWobble).toHaveLength(0);
    expect(snap.scoreAnimations).toHaveLength(0);
    expect(snap.shockwaves).toHaveLength(0);
    expect(snap.stats).toHaveLength(0);
    expect(snap.aiStates).toHaveLength(0);
  });

  it('returns false for matchOver and null for winner', () => {
    const snap = createEmptySnapshot();
    expect(snap.matchOver).toBe(false);
    expect(snap.winner).toBeNull();
  });

  it('each call returns a distinct object (no shared references)', () => {
    const a = createEmptySnapshot();
    const b = createEmptySnapshot();
    expect(a).not.toBe(b);
    expect(a.players).not.toBe(b.players);
    expect(a.carrots).not.toBe(b.carrots);
  });
});

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

describe('takeSnapshotInto', () => {
  it('produces same result as takeSnapshot', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const aiMap = new Map<string, any>([['B1', makeMockAIController()]]);

    const fresh = takeSnapshot(5, state, rng, aiMap);
    rng.setState(fresh.rngState); // reset rng to same state

    const target = createEmptySnapshot();
    takeSnapshotInto(target, 5, state, rng, aiMap);

    // Compare core fields (AI snapshots differ because serialize() is called again)
    expect(target.frame).toBe(fresh.frame);
    expect(target.rngState).toBe(fresh.rngState);
    expect(target.players).toEqual(fresh.players);
    expect(target.carrots).toEqual(fresh.carrots);
    expect(target.bouncyWobble).toEqual(fresh.bouncyWobble);
    expect(target.timeElapsed).toBe(fresh.timeElapsed);
    expect(target.stats).toEqual(fresh.stats);
  });

  it('reuses existing player objects (zero allocation in steady state)', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const target = createEmptySnapshot();

    // First call populates
    takeSnapshotInto(target, 0, state, rng, new Map());
    const playerRef = target.players[0];

    // Second call reuses same object
    state.players[0].x = 999;
    takeSnapshotInto(target, 1, state, rng, new Map());
    expect(target.players[0]).toBe(playerRef);
    expect(target.players[0].x).toBe(999);
  });

  it('grows arrays when source is larger', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const target = createEmptySnapshot();

    // Start with 2 players
    takeSnapshotInto(target, 0, state, rng, new Map());
    expect(target.players).toHaveLength(2);

    // Add a third player
    state.players.push(makeTestPlayer('P3'));
    takeSnapshotInto(target, 1, state, rng, new Map());
    expect(target.players).toHaveLength(3);
  });

  it('shrinks arrays when source is smaller', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const target = createEmptySnapshot();

    takeSnapshotInto(target, 0, state, rng, new Map());
    expect(target.players).toHaveLength(2);

    state.players.pop();
    takeSnapshotInto(target, 1, state, rng, new Map());
    expect(target.players).toHaveLength(1);
  });

  it('correctly updates geyserStates in-place', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const target = createEmptySnapshot();

    takeSnapshotInto(target, 0, state, rng, new Map());
    expect(target.geyserStates[0].timer).toBe(3.0);

    state.geyserStates[0].timer = 1.0;
    state.geyserStates[0].active = false;
    takeSnapshotInto(target, 1, state, rng, new Map());
    expect(target.geyserStates[0].timer).toBe(1.0);
    expect(target.geyserStates[0].active).toBe(false);
  });

  it('correctly updates bouncyWobble from Map', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const target = createEmptySnapshot();

    takeSnapshotInto(target, 0, state, rng, new Map());
    expect(target.bouncyWobble).toEqual([[0, 0.5], [2, 0.3]]);

    state.bouncyWobble.clear();
    state.bouncyWobble.set(7, 0.8);
    takeSnapshotInto(target, 1, state, rng, new Map());
    expect(target.bouncyWobble).toEqual([[7, 0.8]]);
  });

  it('updates AI states via serializeInto', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const ai = makeMockAIController();
    const aiMap = new Map<string, any>([['B1', ai]]);
    const target = createEmptySnapshot();

    takeSnapshotInto(target, 0, state, rng, aiMap);
    expect(ai.serialize).toHaveBeenCalledTimes(1); // first call uses serialize

    takeSnapshotInto(target, 1, state, rng, aiMap);
    expect(ai.serializeInto).toHaveBeenCalled(); // subsequent uses serializeInto
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

describe('crc32 known test vectors', () => {
  it('empty string produces known CRC32', () => {
    // Standard CRC32 of empty string = 0x00000000
    expect(crc32('')).toBe(0);
  });

  it('produces consistent results for known strings', () => {
    const h1 = crc32('hello');
    const h2 = crc32('hello');
    expect(h1).toBe(h2);
    expect(typeof h1).toBe('number');
    expect(h1).toBeGreaterThan(0);
  });

  it('single character hashes are distinct', () => {
    const hashes = new Set<number>();
    for (let i = 0; i < 256; i++) {
      hashes.add(crc32(String.fromCharCode(i)));
    }
    // All 256 single-byte inputs should produce different CRC32 values
    expect(hashes.size).toBe(256);
  });

  it('returns a positive 32-bit unsigned integer', () => {
    const inputs = ['', 'a', 'hello world', '\xff\x00\x80', 'a'.repeat(10000)];
    for (const input of inputs) {
      const hash = crc32(input);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xFFFFFFFF);
      expect(Number.isInteger(hash)).toBe(true);
    }
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

describe('hashGameStateDetailed', () => {
  it('entities subsystem hash changes when carrot is added', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);
    const before = { ...hashGameStateDetailed(state, rng) };
    state.carrots.push({ x: 999, y: 888, collected: false } as any);
    const after = hashGameStateDetailed(state, rng);
    expect(after.entitiesHash).not.toBe(before.entitiesHash);
    expect(after.playersHash).toBe(before.playersHash);
  });

  it('timers subsystem hash changes when carrotTimer changes', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);
    const before = { ...hashGameStateDetailed(state, rng) };
    state.carrotTimer += 1;
    const after = hashGameStateDetailed(state, rng);
    expect(after.timersHash).not.toBe(before.timersHash);
    expect(after.playersHash).toBe(before.playersHash);
    expect(after.entitiesHash).toBe(before.entitiesHash);
  });

  it('returns reused object (same reference on consecutive calls)', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);
    const d1 = hashGameStateDetailed(state, rng);
    const d2 = hashGameStateDetailed(state, rng);
    expect(d1).toBe(d2);
  });
});

describe('hashSnapshot matches hashGameState', () => {
  it('matches for state with entities', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(101);
    const liveHash = hashGameState(state, rng);
    const snap = takeSnapshot(0, state, rng, new Map());
    expect(hashSnapshot(snap)).toBe(liveHash);
  });

  it('matches for empty entity state', () => {
    const state = makeTestMatchState();
    state.carrots = [];
    state.springs = [];
    state.thorns = [];
    state.lavaRocks = [];
    state.geyserStates = [];
    const rng = new SeededRNG(55);
    const liveHash = hashGameState(state, rng);
    const snap = takeSnapshot(0, state, rng, new Map());
    expect(hashSnapshot(snap)).toBe(liveHash);
  });

  it('matches after restoring and re-snapshotting', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(77);
    const snap1 = takeSnapshot(0, state, rng, new Map());
    const hash1 = hashSnapshot(snap1);

    // Mutate state
    state.players[0].x = 0;
    state.carrotTimer = 0;

    // Restore from snap1
    restoreSnapshot(snap1, state, rng, new Map());
    const snap2 = takeSnapshot(0, state, rng, new Map());
    const hash2 = hashSnapshot(snap2);

    expect(hash2).toBe(hash1);
  });
});

// ===================================================================
// Snapshot stress tests
// ===================================================================

describe('Snapshot stress tests', () => {
  it('takeSnapshotInto handles rapidly changing player count', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const target = createEmptySnapshot();

    // 2 players → 3 → 1 → 4
    takeSnapshotInto(target, 0, state, rng, new Map());
    expect(target.players).toHaveLength(2);

    state.players.push(makeTestPlayer('P3'));
    takeSnapshotInto(target, 1, state, rng, new Map());
    expect(target.players).toHaveLength(3);

    state.players = [state.players[0]];
    takeSnapshotInto(target, 2, state, rng, new Map());
    expect(target.players).toHaveLength(1);

    state.players.push(makeTestPlayer('P2'), makeTestPlayer('P3'), makeTestPlayer('P4'));
    takeSnapshotInto(target, 3, state, rng, new Map());
    expect(target.players).toHaveLength(4);
  });

  it('restore + re-snapshot is idempotent', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(99);
    const snap1 = takeSnapshot(0, state, rng, new Map());

    // Restore and re-snapshot multiple times
    for (let i = 0; i < 5; i++) {
      restoreSnapshot(snap1, state, rng, new Map());
      const snap2 = takeSnapshot(0, state, rng, new Map());
      expect(hashSnapshot(snap2)).toBe(hashSnapshot(snap1));
    }
  });

  it('multiple AI controllers serialize in deterministic order', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const ai1 = makeMockAIController();
    const ai2 = makeMockAIController();
    const ai3 = makeMockAIController();

    // Insert in different order each time, should always sort
    const map1 = new Map([['B3', ai3], ['B1', ai1], ['B2', ai2]]) as any;
    const snap1 = takeSnapshot(0, state, rng, map1);

    const map2 = new Map([['B2', ai2], ['B3', ai3], ['B1', ai1]]) as any;
    const snap2 = takeSnapshot(0, state, rng, map2);

    // Both should have same sorted order
    expect(snap1.aiStates.map(([id]: [string, any]) => id)).toEqual(['B1', 'B2', 'B3']);
    expect(snap2.aiStates.map(([id]: [string, any]) => id)).toEqual(['B1', 'B2', 'B3']);
  });

  it('hashGameState is stable across repeated calls', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const h1 = hashGameState(state, rng);
    const h2 = hashGameState(state, rng);
    const h3 = hashGameState(state, rng);
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('crc32 handles long strings', () => {
    const long = 'a'.repeat(100000);
    const h1 = crc32(long);
    const h2 = crc32(long);
    expect(h1).toBe(h2);
    expect(h1).toBeGreaterThan(0);
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

// ===================================================================
// Additional edge-case tests
// ===================================================================

describe('takeSnapshotInto vs takeSnapshot equivalence under mutation', () => {
  it('updates all fields correctly after mutating every field in state', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const target = createEmptySnapshot();

    // Initial snapshot into target
    takeSnapshotInto(target, 0, state, rng, new Map());

    // Mutate EVERY field in state
    state.players[0].x = 999;
    state.players[0].y = 888;
    state.players[0].vx = 77;
    state.players[0].vy = -66;
    state.players[0].score = 99;
    state.players[0].state = 'splatted';
    state.players[0].facing = 'left';
    state.players[0].splatTimer = 9.9;
    state.players[0].respawnTimer = 8.8;
    state.players[0].invincibleTimer = 7.7;
    state.players[0].active = false;
    state.players[0].animFrame = 10;
    state.players[0].animTimer = 5.5;
    state.players[0].fastFalling = false;
    state.players[0].fatTimer = 0;
    state.players[0].slowTimer = 0;
    state.players[0].squashScale = 1.0;
    state.players[0].squashTimer = 0;
    state.players[0].sideSquash = 1.0;
    state.players[0].idleAnimTimer = 0;
    state.players[0].expression = 'dizzy';
    state.players[0].killStreak = 0;
    state.players[0].breathTimer = 0;
    state.players[0].springTrailTimer = 0;
    state.players[0].damageFlashSide = 'right';
    state.players[0].damageFlashTimer = 0;
    state.players[0].burnTimer = 0;
    state.players[0].hitstopTimer = 0;
    state.players[0].disconnected = false;

    state.timeElapsed = 999;
    state.matchOver = true;
    state.winner = 'P2';
    state.countdown = 10;
    state.dayPhase = 0.99;
    state.carrotTimer = 99;
    state.springSpawnTimer = 88;
    state.thornSpawnTimer = 77;
    state.lavaRockTimer = 66;
    state.screenShake = 5;
    state.slowMotion = 4;
    state.screenFlash = 3;
    state.hitstopZoom = 2;

    state.carrots[0].x = 1;
    state.springs[0].x = 2;
    state.thorns[0].x = 3;
    state.lavaRocks[0].x = 4;
    state.geyserStates[0].timer = 0.1;
    state.pigeonFlocks[0].x = 5;
    state.bouncyWobble.clear();
    state.bouncyWobble.set(10, 1.0);

    // Re-snapshot into same target
    takeSnapshotInto(target, 1, state, rng, new Map());

    // Verify all fields updated
    expect(target.frame).toBe(1);
    expect(target.players[0].x).toBe(999);
    expect(target.players[0].y).toBe(888);
    expect(target.players[0].vx).toBe(77);
    expect(target.players[0].vy).toBe(-66);
    expect(target.players[0].score).toBe(99);
    expect(target.players[0].state).toBe('splatted');
    expect(target.players[0].facing).toBe('left');
    expect(target.players[0].splatTimer).toBe(9.9);
    expect(target.players[0].respawnTimer).toBe(8.8);
    expect(target.players[0].invincibleTimer).toBe(7.7);
    expect(target.players[0].active).toBe(false);
    expect(target.players[0].animFrame).toBe(10);
    expect(target.players[0].animTimer).toBe(5.5);
    expect(target.players[0].fastFalling).toBe(false);
    expect(target.players[0].fatTimer).toBe(0);
    expect(target.players[0].slowTimer).toBe(0);
    expect(target.players[0].squashScale).toBe(1.0);
    expect(target.players[0].squashTimer).toBe(0);
    expect(target.players[0].sideSquash).toBe(1.0);
    expect(target.players[0].idleAnimTimer).toBe(0);
    expect(target.players[0].expression).toBe('dizzy');
    expect(target.players[0].killStreak).toBe(0);
    expect(target.players[0].breathTimer).toBe(0);
    expect(target.players[0].springTrailTimer).toBe(0);
    expect(target.players[0].damageFlashSide).toBe('right');
    expect(target.players[0].damageFlashTimer).toBe(0);
    expect(target.players[0].burnTimer).toBe(0);
    expect(target.players[0].hitstopTimer).toBe(0);
    expect(target.players[0].disconnected).toBe(false);

    expect(target.timeElapsed).toBe(999);
    expect(target.matchOver).toBe(true);
    expect(target.winner).toBe('P2');
    expect(target.countdown).toBe(10);
    expect(target.dayPhase).toBe(0.99);
    expect(target.carrotTimer).toBe(99);
    expect(target.springSpawnTimer).toBe(88);
    expect(target.thornSpawnTimer).toBe(77);
    expect(target.lavaRockTimer).toBe(66);
    expect(target.screenShake).toBe(5);
    expect(target.slowMotion).toBe(4);
    expect(target.screenFlash).toBe(3);
    expect(target.hitstopZoom).toBe(2);

    expect(target.carrots[0].x).toBe(1);
    expect(target.springs[0].x).toBe(2);
    expect(target.thorns[0].x).toBe(3);
    expect(target.lavaRocks[0].x).toBe(4);
    expect(target.geyserStates[0].timer).toBe(0.1);
    expect(target.pigeonFlocks[0].x).toBe(5);
    expect(target.bouncyWobble).toEqual([[10, 1.0]]);

    // Also verify consistency: fresh takeSnapshot should produce same values
    const fresh = takeSnapshot(1, state, rng, new Map());
    expect(target.players[0].x).toBe(fresh.players[0].x);
    expect(target.timeElapsed).toBe(fresh.timeElapsed);
    expect(target.carrots).toEqual(fresh.carrots);
    expect(target.bouncyWobble).toEqual(fresh.bouncyWobble);
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

describe('hashGameStateDetailed all subsystems change', () => {
  it('mutating player, entity, and timer simultaneously changes all 3 subsystem hashes', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);
    const before = { ...hashGameStateDetailed(state, rng) };

    // Mutate player (players subsystem)
    state.players[0].x += 50;
    // Mutate entity (entities subsystem)
    state.carrots[0].x += 100;
    // Mutate timer (timers subsystem)
    state.timeElapsed += 10;

    const after = hashGameStateDetailed(state, rng);

    expect(after.playersHash).not.toBe(before.playersHash);
    expect(after.entitiesHash).not.toBe(before.entitiesHash);
    expect(after.timersHash).not.toBe(before.timersHash);
    expect(after.hash).not.toBe(before.hash);
  });

  it('mutating only one subsystem leaves others unchanged', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(1);

    // Only mutate player
    const before = { ...hashGameStateDetailed(state, rng) };
    state.players[0].score += 5;
    const after = hashGameStateDetailed(state, rng);

    expect(after.playersHash).not.toBe(before.playersHash);
    expect(after.entitiesHash).toBe(before.entitiesHash);
    expect(after.timersHash).toBe(before.timersHash);
  });
});

describe('crc32 collision resistance', () => {
  it('1000 unique short strings produce no hash collisions', () => {
    const hashes = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const str = `test_string_${i}_${String.fromCharCode(65 + (i % 26))}`;
      hashes.add(crc32(str));
    }
    expect(hashes.size).toBe(1000);
  });

  it('sequential integers as strings produce unique hashes', () => {
    const hashes = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      hashes.add(crc32(String(i)));
    }
    expect(hashes.size).toBe(1000);
  });

  it('similar strings with single character difference produce different hashes', () => {
    const base = 'the quick brown fox jumps over the lazy dog';
    const baseHash = crc32(base);
    for (let i = 0; i < base.length; i++) {
      const modified = base.slice(0, i) + String.fromCharCode(base.charCodeAt(i) + 1) + base.slice(i + 1);
      expect(crc32(modified)).not.toBe(baseHash);
    }
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

describe('bouncyWobble with many entries', () => {
  it('Map with 10 entries is sorted correctly in snapshot', () => {
    const state = makeTestMatchState();
    state.bouncyWobble.clear();

    // Insert in reverse order
    for (let i = 9; i >= 0; i--) {
      state.bouncyWobble.set(i, (i + 1) * 0.1);
    }

    const snap = takeSnapshot(0, state, undefined, new Map());
    expect(snap.bouncyWobble).toHaveLength(10);

    // Verify sorted order (keys 0..9)
    for (let i = 0; i < 10; i++) {
      expect(snap.bouncyWobble[i][0]).toBe(i);
      expect(snap.bouncyWobble[i][1]).toBeCloseTo((i + 1) * 0.1);
    }
  });

  it('takeSnapshotInto correctly handles growing bouncyWobble from 2 to 10 entries', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const target = createEmptySnapshot();

    // Start with 2 entries (from makeTestMatchState)
    takeSnapshotInto(target, 0, state, rng, new Map());
    expect(target.bouncyWobble).toHaveLength(2);

    // Grow to 10 entries
    state.bouncyWobble.clear();
    for (let i = 0; i < 10; i++) {
      state.bouncyWobble.set(i * 3, i * 0.05);
    }
    takeSnapshotInto(target, 1, state, rng, new Map());
    expect(target.bouncyWobble).toHaveLength(10);

    // Verify sorted by key
    for (let i = 0; i < 10; i++) {
      expect(target.bouncyWobble[i][0]).toBe(i * 3);
    }
  });

  it('bouncyWobble round-trips through snapshot and restore', () => {
    const state = makeTestMatchState();
    state.bouncyWobble.clear();
    for (let i = 9; i >= 0; i--) {
      state.bouncyWobble.set(i, (i + 1) * 0.1);
    }

    const snap = takeSnapshot(0, state, undefined, new Map());

    // Clear and restore
    state.bouncyWobble.clear();
    expect(state.bouncyWobble.size).toBe(0);

    restoreSnapshot(snap, state, undefined, new Map());
    expect(state.bouncyWobble.size).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(state.bouncyWobble.get(i)).toBeCloseTo((i + 1) * 0.1);
    }
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

describe('GameSnapshot type completeness', () => {
  it('createEmptySnapshot has every field that takeSnapshot produces', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const taken = takeSnapshot(0, state, rng, new Map());
    const empty = createEmptySnapshot();

    const takenKeys = Object.keys(taken).sort();
    const emptyKeys = Object.keys(empty).sort();

    expect(emptyKeys).toEqual(takenKeys);
  });

  it('createEmptySnapshot fields have correct default types matching takeSnapshot', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(42);
    const taken = takeSnapshot(0, state, rng, new Map());
    const empty = createEmptySnapshot();

    for (const key of Object.keys(taken)) {
      const takenType = Array.isArray(taken[key as keyof GameSnapshot]) ? 'array' : typeof taken[key as keyof GameSnapshot];
      const emptyType = Array.isArray(empty[key as keyof GameSnapshot]) ? 'array' : typeof empty[key as keyof GameSnapshot];
      expect(emptyType).toBe(takenType);
    }
  });
});
