import { describe, it, expect } from 'vitest';
import { isStomping, checkStomps, createSplatMark, updateSplatTimers, respawnPlayer } from './stomp';
import type { Player, SpawnPoint } from './types';
import { CHARACTERS } from './characters';
import { PLAYER_WIDTH, PLAYER_HEIGHT, SPLAT_DURATION, RESPAWN_DELAY, INVINCIBLE_DURATION } from './constants';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'P1',
    character: CHARACTERS.P1,
    x: 100,
    y: 400,
    vx: 0,
    vy: 0,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    state: 'idle',
    facing: 'right',
    splatTimer: 0,
    respawnTimer: 0,
    invincibleTimer: 0,
    score: 0,
    active: true,
    animFrame: 0,
    animTimer: 0,
    fastFalling: false,
    fatTimer: 0,
    slowTimer: 0,
    burnTimer: 0,
    hitstopTimer: 0,
    ...overrides,
  };
}

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
});
