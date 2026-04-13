import { describe, it, expect } from 'vitest';
import { isStomping, checkStomps, createSplatMark, updateSplatTimers, respawnPlayer } from './stomp';
import type { SpawnPoint } from './types';
import { CHARACTERS } from './characters';
import { PLAYER_WIDTH, PLAYER_HEIGHT, SPLAT_DURATION, RESPAWN_DELAY, INVINCIBLE_DURATION, STOMP_VY_THRESHOLD, STOMP_BOUNCE } from './constants';
import { makePlayer } from './__tests__/testHelpers';
import { SeededRNG } from './net/prng';

const spawnPoints: SpawnPoint[] = [
  { x: 200, y: 500 },
  { x: 640, y: 400 },
];

describe('Stomp - isStomping', () => {
  it('detects stomp when attacker falls on victim', () => {
    const attacker = makePlayer({
      id: 'P1',
      x: 100, y: 380,
      vy: 200, // falling fast
    });
    const victim = makePlayer({
      id: 'P2',
      character: CHARACTERS.P2,
      x: 100, y: 400,
    });
    expect(isStomping(attacker, victim)).toBe(true);
  });

  it('does not detect stomp when attacker is moving upward', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 390, vy: -100 });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400 });
    expect(isStomping(attacker, victim)).toBe(false);
  });

  it('does not detect stomp when too far apart', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 200, vy: 200 });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400 });
    expect(isStomping(attacker, victim)).toBe(false);
  });

  it('does not detect stomp from below (side collision)', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 420, vy: 200 });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400 });
    expect(isStomping(attacker, victim)).toBe(false);
  });
});

describe('Stomp - checkStomps', () => {
  it('registers a stomp kill and updates scores', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle' });
    const players = [attacker, victim];

    const { splatMarks, killFeedEntries } = checkStomps(players, spawnPoints, 10);

    expect(splatMarks).toHaveLength(1);
    expect(killFeedEntries).toHaveLength(1);
    expect(killFeedEntries[0].attacker).toBe('P1');
    expect(killFeedEntries[0].victim).toBe('P2');
    expect(attacker.score).toBe(2);
    expect(victim.state).toBe('splat');
  });

  it('does not stomp invincible players', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({
      id: 'P2', character: CHARACTERS.P2,
      x: 100, y: 400, state: 'idle', invincibleTimer: 1.0,
    });
    const players = [attacker, victim];

    const { killFeedEntries } = checkStomps(players, spawnPoints, 10);
    expect(killFeedEntries).toHaveLength(0);
    expect(victim.state).toBe('idle');
  });

  it('does not stomp already-splatted players', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({
      id: 'P2', character: CHARACTERS.P2,
      x: 100, y: 400, state: 'splat',
    });
    const players = [attacker, victim];

    const { killFeedEntries } = checkStomps(players, spawnPoints, 10);
    expect(killFeedEntries).toHaveLength(0);
  });

  it('gives attacker a bounce after stomp', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle' });

    checkStomps([attacker, victim], spawnPoints, 10);
    expect(attacker.vy).toBeLessThan(0); // bounced upward
    expect(attacker.state).toBe('airborne');
  });
});

describe('Stomp - createSplatMark', () => {
  it('creates a splat mark at victim position', () => {
    const victim = makePlayer({ x: 200, y: 300 });
    const mark = createSplatMark(victim);

    expect(mark.x).toBe(200 + PLAYER_WIDTH / 2);
    expect(mark.y).toBe(300 + PLAYER_HEIGHT / 2);
    expect(mark.color).toBe(CHARACTERS.P1.color);
    expect(mark.particles.length).toBeGreaterThan(0);
  });
});

describe('Stomp - updateSplatTimers', () => {
  it('transitions from splat to respawning after duration', () => {
    const player = makePlayer({ state: 'splat', splatTimer: SPLAT_DURATION });

    updateSplatTimers([player], spawnPoints, SPLAT_DURATION + 0.01);
    expect(player.state).toBe('respawning');
    expect(player.respawnTimer).toBeGreaterThan(0);
  });

  it('decreases invincible timer', () => {
    const player = makePlayer({ invincibleTimer: 1.0 });
    updateSplatTimers([player], spawnPoints, 0.5);
    expect(player.invincibleTimer).toBeCloseTo(0.5, 1);
  });
});

describe('Stomp - respawnPlayer', () => {
  it('places player at a spawn point with invincibility', () => {
    const player = makePlayer({ state: 'splat', vx: 100, vy: 200 });
    respawnPlayer(player, spawnPoints);

    expect(player.state).toBe('idle');
    expect(player.vx).toBe(0);
    expect(player.vy).toBe(0);
    expect(player.invincibleTimer).toBe(INVINCIBLE_DURATION);
    expect(player.splatTimer).toBe(0);
    expect(player.respawnTimer).toBe(0);
  });

  it('clears fastFalling on respawn', () => {
    const player = makePlayer({ state: 'splat', fastFalling: true });
    respawnPlayer(player, spawnPoints);
    expect(player.fastFalling).toBe(false);
  });

  it('places player at one of the available spawn points', () => {
    const player = makePlayer({ state: 'splat' });
    respawnPlayer(player, spawnPoints);
    // Player center should be at one of the spawn points
    const playerCx = player.x + PLAYER_WIDTH / 2;
    const matchesAny = spawnPoints.some(sp => Math.abs(sp.x - playerCx) < 1);
    expect(matchesAny).toBe(true);
  });
});

// ===================================================================
// Stomp threshold edge cases
// ===================================================================

describe('Stomp - threshold edge cases', () => {
  it('STOMP_VY_THRESHOLD boundary: vy just below threshold does NOT stomp', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: STOMP_VY_THRESHOLD - 1 });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400 });
    expect(isStomping(attacker, victim)).toBe(false);
  });

  it('STOMP_VY_THRESHOLD boundary: vy at exactly threshold DOES stomp', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: STOMP_VY_THRESHOLD });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400 });
    expect(isStomping(attacker, victim)).toBe(true);
  });

  it('attacker bounces with STOMP_BOUNCE velocity after kill', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle' });
    checkStomps([attacker, victim], spawnPoints, 10);
    expect(attacker.vy).toBe(STOMP_BOUNCE);
  });

  it('victim gets SPLAT_DURATION timer on stomp', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle' });
    checkStomps([attacker, victim], spawnPoints, 10);
    expect(victim.splatTimer).toBe(SPLAT_DURATION);
  });

  it('does not stomp inactive players', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle', active: false });
    const { killFeedEntries } = checkStomps([attacker, victim], spawnPoints, 10);
    expect(killFeedEntries).toHaveLength(0);
  });

  it('does not stomp respawning players', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'respawning' });
    const { killFeedEntries } = checkStomps([attacker, victim], spawnPoints, 10);
    expect(killFeedEntries).toHaveLength(0);
  });

  it('can stomp disconnected players (they remain as targets)', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle', disconnected: true });
    const { killFeedEntries } = checkStomps([attacker, victim], spawnPoints, 10);
    // Disconnected players can still be killed — they just don't respawn
    expect(killFeedEntries).toHaveLength(1);
  });
});

// ===================================================================
// Timer transitions
// ===================================================================

describe('Stomp - full lifecycle', () => {
  it('splat → respawning → idle transition', () => {
    const player = makePlayer({ state: 'splat', splatTimer: 0.01, active: true });

    // Step 1: small tick to push splatTimer to <=0 → respawning
    updateSplatTimers([player], spawnPoints, 0.02);
    expect(player.state).toBe('respawning');

    // Step 2: set respawnTimer directly, then tick to trigger respawn
    player.respawnTimer = 0.01;
    updateSplatTimers([player], spawnPoints, 0.02);
    expect(player.state).toBe('idle');
    expect(player.invincibleTimer).toBeCloseTo(INVINCIBLE_DURATION, 1);
  });

  it('disconnected players stay as corpse (no respawn)', () => {
    const player = makePlayer({ state: 'splat', splatTimer: SPLAT_DURATION, active: true, disconnected: true });
    updateSplatTimers([player], spawnPoints, SPLAT_DURATION + 1);
    // disconnected players skip splatTimer decay
    expect(player.state).toBe('splat');
  });

  it('invincibleTimer decays to 0 and stops', () => {
    const player = makePlayer({ invincibleTimer: 0.5 });
    updateSplatTimers([player], spawnPoints, 0.5);
    expect(player.invincibleTimer).toBeCloseTo(0, 1);
    updateSplatTimers([player], spawnPoints, 0.5);
    // Should not go below 0
    expect(player.invincibleTimer).toBeLessThanOrEqual(0);
  });

  it('inactive players are skipped in timer updates', () => {
    const player = makePlayer({ state: 'splat', splatTimer: SPLAT_DURATION, active: false });
    updateSplatTimers([player], spawnPoints, SPLAT_DURATION + 1);
    // inactive = skipped entirely
    expect(player.state).toBe('splat');
  });
});

// ===================================================================
// Constants validation
// ===================================================================

describe('Stomp constants', () => {
  it('STOMP_VY_THRESHOLD is 50', () => expect(STOMP_VY_THRESHOLD).toBe(50));
  it('STOMP_BOUNCE is -400', () => expect(STOMP_BOUNCE).toBe(-400));
  it('SPLAT_DURATION is 0.4', () => expect(SPLAT_DURATION).toBe(0.4));
  it('RESPAWN_DELAY is 1.0', () => expect(RESPAWN_DELAY).toBe(1));
  it('INVINCIBLE_DURATION is 1.5', () => expect(INVINCIBLE_DURATION).toBe(1.5));
});

// ===================================================================
// checkStomps edge cases
// ===================================================================

describe('checkStomps - edge cases', () => {
  it('attacker state is set to airborne after stomp', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle' });
    checkStomps([attacker, victim], spawnPoints, 10);
    expect(attacker.state).toBe('airborne');
  });

  it('victim velocity is zeroed on stomp', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle', vx: 100, vy: -50 });
    checkStomps([attacker, victim], spawnPoints, 10);
    expect(victim.vx).toBe(0);
    expect(victim.vy).toBe(0);
  });

  it('killFeedEntry includes correct timestamp', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle' });
    const { killFeedEntries } = checkStomps([attacker, victim], spawnPoints, 42.5);
    expect(killFeedEntries[0].timestamp).toBe(42.5);
  });

  it('carrotChase mod: stomp does not award points', () => {
    const attacker = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne', score: 0 });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle' });
    checkStomps([attacker, victim], spawnPoints, 10, { carrotChase: true, extremeGore: false, giantPlayers: false, turbo: false, superBounce: false, mirrorArena: false, underwaterGravity: false });
    expect(attacker.score).toBe(0); // no points in carrot chase
    expect(victim.state).toBe('splat'); // but still splats
  });

  it('splatMark is created at victim center', () => {
    const attacker = makePlayer({ id: 'P1', x: 200, y: 380, vy: 200, state: 'airborne' });
    const victim = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 200, y: 400, state: 'idle' });
    const { splatMarks } = checkStomps([attacker, victim], spawnPoints, 10);
    expect(splatMarks[0].x).toBe(200 + PLAYER_WIDTH / 2);
    expect(splatMarks[0].y).toBe(400 + PLAYER_HEIGHT / 2);
  });

  it('three-player multi-kill in one frame', () => {
    // P1 stomps P2, P3 stomps P1 (simultaneously)
    const p1 = makePlayer({ id: 'P1', x: 100, y: 380, vy: 200, state: 'airborne' });
    const p2 = makePlayer({ id: 'P2', character: CHARACTERS.P2, x: 100, y: 400, state: 'idle' });
    const p3 = makePlayer({ id: 'P3', character: CHARACTERS.P3, x: 100, y: 360, vy: 200, state: 'airborne' });
    // P3 above P1 (stomps P1), P1 above P2 (stomps P2)
    const { killFeedEntries } = checkStomps([p3, p1, p2], spawnPoints, 10);
    // At least one kill should register
    expect(killFeedEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('self-stomp is impossible', () => {
    const p = makePlayer({ id: 'P1', x: 100, y: 400, vy: 200, state: 'airborne' });
    const { killFeedEntries } = checkStomps([p], spawnPoints, 10);
    expect(killFeedEntries).toHaveLength(0);
  });
});

// ===================================================================
// createSplatMark details
// ===================================================================

describe('createSplatMark - details', () => {
  it('splat mark has color from victim character', () => {
    const victim = makePlayer({ character: CHARACTERS.P2 });
    const mark = createSplatMark(victim);
    expect(mark.color).toBe(CHARACTERS.P2.color);
  });

  it('splat mark has particles array with > 0 entries', () => {
    const mark = createSplatMark(makePlayer());
    expect(mark.particles.length).toBeGreaterThan(0);
    expect(mark.particles.length).toBeLessThanOrEqual(16); // 8 + random(0-7)
  });

  it('splat mark has radius > 0', () => {
    const mark = createSplatMark(makePlayer());
    expect(mark.radius).toBeGreaterThan(0);
  });
});

// ===================================================================
// isStomping geometry precision
// ===================================================================

describe('isStomping - geometry precision', () => {
  // overlap = (attacker.y + attacker.height) - victim.y
  // Stomp requires: overlap > 0 && overlap < victim.height * 0.5
  // victim.height * 0.5 = 16 (PLAYER_HEIGHT = 32)

  it('overlap exactly at victim.height * 0.5 boundary returns false (not strictly <)', () => {
    // overlap = attackerBottom - victimTop = (attacker.y + 32) - victim.y
    // We want overlap = 32 * 0.5 = 16 exactly
    // So attacker.y + 32 - victim.y = 16 → attacker.y = victim.y - 16
    const victim = makePlayer({ id: 'P2', x: 100, y: 400 });
    const attacker = makePlayer({ id: 'P1', x: 100, y: 400 - PLAYER_HEIGHT * 0.5, vy: STOMP_VY_THRESHOLD });
    // overlap = (384 + 32) - 400 = 16 = victim.height * 0.5 → NOT < 0.5*h → false
    expect(isStomping(attacker, victim)).toBe(false);
  });

  it('overlap = victim.height * 0.5 - 1 returns true', () => {
    // overlap = 15 < 16 → true
    const victim = makePlayer({ id: 'P2', x: 100, y: 400 });
    const attacker = makePlayer({ id: 'P1', x: 100, y: 400 - PLAYER_HEIGHT * 0.5 - 1, vy: STOMP_VY_THRESHOLD });
    // overlap = (383 + 32) - 400 = 15 → true
    expect(isStomping(attacker, victim)).toBe(true);
  });

  it('no horizontal overlap returns false', () => {
    // Place attacker completely to the right of victim with a gap
    const victim = makePlayer({ id: 'P2', x: 100, y: 400 });
    const attacker = makePlayer({ id: 'P1', x: 100 + PLAYER_WIDTH + 10, y: 390, vy: 200 });
    expect(isStomping(attacker, victim)).toBe(false);
  });

  it('edge-touching horizontally (attacker right == victim left) returns false (strict <)', () => {
    // aabbOverlap uses strict < : ax < bx + bw && ax + aw > bx
    // attacker.x + attacker.width == victim.x → ax + aw > bx is false (equal, not >)
    // Wait: ax + aw > bx → 132 + 32 > 164? No: attacker right = victim left
    // Actually: attacker to the left, attacker.x + width = victim.x
    const victim = makePlayer({ id: 'P2', x: 100 + PLAYER_WIDTH, y: 400 });
    const attacker = makePlayer({ id: 'P1', x: 100, y: 390, vy: 200 });
    // attacker: x=100, width=32 → right=132. victim: x=132 → ax + aw = 132, bx = 132 → 132 > 132 is false
    expect(isStomping(attacker, victim)).toBe(false);
  });

  it('1px horizontal overlap returns true (with valid stomp geometry)', () => {
    // attacker right = victim left + 1 → overlap of 1px
    const victim = makePlayer({ id: 'P2', x: 100 + PLAYER_WIDTH - 1, y: 400 });
    const attacker = makePlayer({ id: 'P1', x: 100, y: 395, vy: 200 });
    // attacker right = 132, victim left = 131 → 132 > 131 ✓
    // vertical overlap = (395 + 32) - 400 = 27 → but 27 >= 16 → too deep
    // Need less vertical overlap: attacker.y such that overlap < 16
    // overlap = attacker.y + 32 - 400 < 16 → attacker.y < 384
    // overlap > 0 → attacker.y + 32 > 400 → attacker.y > 368
    // Use attacker.y = 378 → overlap = 410 - 400 = 10 ✓
    const attacker2 = makePlayer({ id: 'P1', x: 100, y: 378, vy: 200 });
    const victim2 = makePlayer({ id: 'P2', x: 100 + PLAYER_WIDTH - 1, y: 400 });
    expect(isStomping(attacker2, victim2)).toBe(true);
  });

  it('attacker fully inside victim vertically returns false (overlap >= 0.5 * height)', () => {
    // If attacker is inside victim, overlap = attacker.y + height - victim.y
    // Attacker at same y as victim → overlap = 32 (full height) ≥ 16 → false
    const victim = makePlayer({ id: 'P2', x: 100, y: 400 });
    const attacker = makePlayer({ id: 'P1', x: 100, y: 400, vy: 200 });
    // overlap = (400 + 32) - 400 = 32 ≥ 16 → false
    expect(isStomping(attacker, victim)).toBe(false);
  });

  it('attacker below victim (negative overlap) returns false', () => {
    // attacker.y > victim.y + victim.height → overlap negative
    const victim = makePlayer({ id: 'P2', x: 100, y: 400 });
    const attacker = makePlayer({ id: 'P1', x: 100, y: 420, vy: 200 });
    // overlap = (420 + 32) - 400 = 52 ≥ 16 → false (also not a stomp position)
    expect(isStomping(attacker, victim)).toBe(false);
  });

  it('overlap of exactly 1px returns true (minimum valid stomp)', () => {
    // overlap = 1 → attacker.y + 32 - victim.y = 1 → attacker.y = victim.y - 31
    const victim = makePlayer({ id: 'P2', x: 100, y: 400 });
    const attacker = makePlayer({ id: 'P1', x: 100, y: 400 - PLAYER_HEIGHT + 1, vy: 200 });
    // overlap = (369 + 32) - 400 = 1 → 1 > 0 && 1 < 16 → true
    // But we also need AABB overlap: vertical check: ay < by + bh → 369 < 432 ✓, ay + ah > by → 401 > 400 ✓
    expect(isStomping(attacker, victim)).toBe(true);
  });

  it('overlap of exactly 0 returns false (just touching top edge)', () => {
    // overlap = 0 → attacker.y + 32 = victim.y → attacker.y = victim.y - 32
    const victim = makePlayer({ id: 'P2', x: 100, y: 400 });
    const attacker = makePlayer({ id: 'P1', x: 100, y: 400 - PLAYER_HEIGHT, vy: 200 });
    // overlap = (368 + 32) - 400 = 0 → 0 > 0 is false → false
    // Also AABB: ay + ah > by → 400 > 400 is false → no overlap
    expect(isStomping(attacker, victim)).toBe(false);
  });
});

// ===================================================================
// respawnPlayer with allPlayers avoidance
// ===================================================================

describe('respawnPlayer - spawn avoidance and determinism', () => {
  const wideSpawns: SpawnPoint[] = [
    { x: 100, y: 500 },
    { x: 600, y: 500 },
    { x: 1100, y: 500 },
  ];

  it('picks spawn farthest from other players', () => {
    const player = makePlayer({ id: 'P1', state: 'splat' });
    // Other player sits near spawn at x=100
    const other = makePlayer({ id: 'P2', x: 100 - PLAYER_WIDTH / 2, y: 500 - PLAYER_HEIGHT, state: 'idle' });
    respawnPlayer(player, wideSpawns, [player, other]);
    // Should pick spawn at x=1100 (farthest from other at x~100)
    const playerCx = player.x + PLAYER_WIDTH / 2;
    expect(playerCx).toBe(1100);
  });

  it('avoids multiple nearby players by maximizing minimum distance', () => {
    const player = makePlayer({ id: 'P1', state: 'splat' });
    // Two other players near spawns at x=100 and x=1100
    const other1 = makePlayer({ id: 'P2', x: 100 - PLAYER_WIDTH / 2, y: 500 - PLAYER_HEIGHT, state: 'idle' });
    const other2 = makePlayer({ id: 'P3', x: 1100 - PLAYER_WIDTH / 2, y: 500 - PLAYER_HEIGHT, state: 'idle' });
    respawnPlayer(player, wideSpawns, [player, other1, other2]);
    // Should pick middle spawn at x=600 (farthest from both)
    const playerCx = player.x + PLAYER_WIDTH / 2;
    expect(playerCx).toBe(600);
  });

  it('with seeded RNG and no other players, produces deterministic placement', () => {
    // With no other active players (all splatted), pickSafeSpawn falls through to random pick
    const spawns: SpawnPoint[] = [
      { x: 100, y: 500 },
      { x: 400, y: 500 },
      { x: 700, y: 500 },
      { x: 1000, y: 500 },
    ];

    // Run twice with same seed — should pick same spawn
    const p1 = makePlayer({ id: 'P1', state: 'splat' });
    const p2 = makePlayer({ id: 'P1', state: 'splat' });
    // No other active players — allPlayers is empty array
    respawnPlayer(p1, spawns, [], new SeededRNG(42));
    respawnPlayer(p2, spawns, [], new SeededRNG(42));
    expect(p1.x).toBe(p2.x);
    expect(p1.y).toBe(p2.y);
  });

  it('resets all expected fields on respawn', () => {
    const player = makePlayer({
      id: 'P1',
      state: 'splat',
      vx: 150,
      vy: 300,
      splatTimer: 0.2,
      respawnTimer: 0.1,
      fastFalling: true,
      fatTimer: 1.5,
      slowTimer: 2.0,
      burnTimer: 0.8,
      hitstopTimer: 0.3,
      killStreak: 5,
      expression: 'hurt' as Player['expression'],
    });
    respawnPlayer(player, wideSpawns);

    expect(player.state).toBe('idle');
    expect(player.vx).toBe(0);
    expect(player.vy).toBe(0);
    expect(player.invincibleTimer).toBe(INVINCIBLE_DURATION);
    expect(player.splatTimer).toBe(0);
    expect(player.respawnTimer).toBe(0);
    expect(player.fastFalling).toBe(false);
    expect(player.fatTimer).toBe(0);
    expect(player.slowTimer).toBe(0);
    expect(player.burnTimer).toBe(0);
    expect(player.hitstopTimer).toBe(0);
    // killStreak and expression are NOT reset by respawnPlayer (verified by reading source)
    // killStreak is preserved across respawns intentionally
    expect(player.killStreak).toBe(5);
  });
});

// ===================================================================
// updateSplatTimers with multiple players
// ===================================================================

describe('updateSplatTimers - multiple players', () => {
  it('two players splatted simultaneously both transition to respawning', () => {
    const p1 = makePlayer({ id: 'P1', state: 'splat', splatTimer: SPLAT_DURATION });
    const p2 = makePlayer({ id: 'P2', state: 'splat', splatTimer: SPLAT_DURATION });

    const dt = SPLAT_DURATION + 0.01;
    updateSplatTimers([p1, p2], spawnPoints, dt);

    expect(p1.state).toBe('respawning');
    expect(p2.state).toBe('respawning');
    // respawnTimer is set to RESPAWN_DELAY then immediately decremented by dt in the same tick
    expect(p1.respawnTimer).toBeCloseTo(RESPAWN_DELAY - dt, 5);
    expect(p2.respawnTimer).toBeCloseTo(RESPAWN_DELAY - dt, 5);
  });

  it('one splatted and one respawning tick independently', () => {
    const splatted = makePlayer({ id: 'P1', state: 'splat', splatTimer: SPLAT_DURATION });
    const respawning = makePlayer({ id: 'P2', state: 'respawning', respawnTimer: RESPAWN_DELAY });

    // Tick a small amount — neither should transition yet
    const dt = 0.1;
    updateSplatTimers([splatted, respawning], spawnPoints, dt);

    expect(splatted.state).toBe('splat');
    expect(splatted.splatTimer).toBeCloseTo(SPLAT_DURATION - dt, 5);
    expect(respawning.state).toBe('respawning');
    expect(respawning.respawnTimer).toBeCloseTo(RESPAWN_DELAY - dt, 5);
  });

  it('very small dt still decrements timer (precision)', () => {
    const player = makePlayer({ id: 'P1', state: 'splat', splatTimer: SPLAT_DURATION });
    const tinyDt = 0.0001;

    updateSplatTimers([player], spawnPoints, tinyDt);

    expect(player.splatTimer).toBeCloseTo(SPLAT_DURATION - tinyDt, 5); // fround for network determinism reduces precision
    expect(player.state).toBe('splat'); // Should NOT have transitioned
  });
});
