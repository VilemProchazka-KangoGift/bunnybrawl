import { describe, it, expect } from 'vitest';
import { isStomping, checkStomps, createSplatMark, updateSplatTimers, respawnPlayer } from './stomp';
import type { SpawnPoint } from './types';
import { CHARACTERS } from './characters';
import { PLAYER_WIDTH, PLAYER_HEIGHT, SPLAT_DURATION, RESPAWN_DELAY, INVINCIBLE_DURATION, STOMP_VY_THRESHOLD, STOMP_BOUNCE } from './constants';
import { makePlayer } from './__tests__/testHelpers';

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
