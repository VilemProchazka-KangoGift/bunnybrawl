import { describe, it, expect } from 'vitest';
import {
  applyInput, applyGravity, movePlayer, wrapHorizontal,
  collidePlatforms, updatePlayerState, aabbOverlap, applyArenaConstraints,
} from './physics';
import type { Player, Platform, Arena, InputState } from './types';
import {
  GRAVITY, MAX_WALK_SPEED, ACCELERATION, FRICTION,
  JUMP_IMPULSE, PLAYER_WIDTH, PLAYER_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT,
} from './constants';
import { CHARACTERS } from './characters';

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
    sideSquash: 1,
    burnTimer: 0,
    ...overrides,
  };
}

const noInput: InputState = { left: false, right: false, jump: false, down: false };

describe('Physics - applyInput', () => {
  it('accelerates player right when right input is pressed', () => {
    const player = makePlayer();
    applyInput(player, { left: false, right: true, jump: false, down: false }, 1 / 60);
    expect(player.vx).toBeGreaterThan(0);
    expect(player.facing).toBe('right');
  });

  it('accelerates player left when left input is pressed', () => {
    const player = makePlayer();
    applyInput(player, { left: true, right: false, jump: false, down: false }, 1 / 60);
    expect(player.vx).toBeLessThan(0);
    expect(player.facing).toBe('left');
  });

  it('applies friction when no input', () => {
    const player = makePlayer({ vx: 200 });
    applyInput(player, noInput, 1 / 60);
    expect(player.vx).toBeLessThan(200);
    expect(player.vx).toBeGreaterThan(0);
  });

  it('clamps horizontal speed to MAX_WALK_SPEED', () => {
    const player = makePlayer({ vx: MAX_WALK_SPEED - 1 });
    // Apply multiple frames of acceleration
    for (let i = 0; i < 60; i++) {
      applyInput(player, { left: false, right: true, jump: false, down: false }, 1 / 60);
    }
    expect(player.vx).toBeLessThanOrEqual(MAX_WALK_SPEED);
  });

  it('applies jump impulse when jump is pressed and not airborne', () => {
    const player = makePlayer({ state: 'idle' });
    applyInput(player, { left: false, right: false, jump: true, down: false }, 1 / 60);
    expect(player.vy).toBe(JUMP_IMPULSE);
    expect(player.state).toBe('airborne');
  });

  it('does not jump when already airborne', () => {
    const player = makePlayer({ state: 'airborne', vy: -100 });
    applyInput(player, { left: false, right: false, jump: true, down: false }, 1 / 60);
    expect(player.vy).toBe(-100); // unchanged
  });

  it('ignores input when player is splatted', () => {
    const player = makePlayer({ state: 'splat' });
    applyInput(player, { left: true, right: false, jump: true, down: false }, 1 / 60);
    expect(player.vx).toBe(0);
    expect(player.vy).toBe(0);
  });

  it('ignores input when player is respawning', () => {
    const player = makePlayer({ state: 'respawning' });
    applyInput(player, { left: true, right: false, jump: true, down: false }, 1 / 60);
    expect(player.vx).toBe(0);
  });

  it('sets fastFalling when down is pressed while airborne', () => {
    const player = makePlayer({ state: 'airborne', vy: 100 });
    applyInput(player, { left: false, right: false, jump: false, down: true }, 1 / 60);
    expect(player.fastFalling).toBe(true);
  });

  it('does not set fastFalling when on ground', () => {
    const player = makePlayer({ state: 'idle' });
    applyInput(player, { left: false, right: false, jump: false, down: true }, 1 / 60);
    expect(player.fastFalling).toBe(false);
  });
});

describe('Physics - applyGravity', () => {
  it('increases downward velocity', () => {
    const player = makePlayer({ vy: 0 });
    applyGravity(player, 1 / 60);
    expect(player.vy).toBeCloseTo(GRAVITY / 60, 1);
  });

  it('does not exceed max fall speed', () => {
    const player = makePlayer({ vy: 590 });
    applyGravity(player, 1);
    expect(player.vy).toBe(600); // MAX_FALL_SPEED
  });

  it('skips gravity when splatted', () => {
    const player = makePlayer({ state: 'splat', vy: 0 });
    applyGravity(player, 1 / 60);
    expect(player.vy).toBe(0);
  });

  it('applies faster gravity when fast-falling', () => {
    const normalPlayer = makePlayer({ vy: 0 });
    const fastPlayer = makePlayer({ vy: 0, fastFalling: true });
    applyGravity(normalPlayer, 1 / 60);
    applyGravity(fastPlayer, 1 / 60);
    expect(fastPlayer.vy).toBeGreaterThan(normalPlayer.vy);
  });

  it('allows higher max speed when fast-falling', () => {
    const player = makePlayer({ vy: 850, fastFalling: true });
    applyGravity(player, 1);
    expect(player.vy).toBe(900); // FAST_FALL_SPEED
  });
});

describe('Physics - movePlayer', () => {
  it('moves player by velocity * dt', () => {
    const player = makePlayer({ vx: 100, vy: 50 });
    movePlayer(player, 0.5);
    expect(player.x).toBe(150);
    expect(player.y).toBe(425);
  });

  it('does not move splatted player', () => {
    const player = makePlayer({ state: 'splat', vx: 100, vy: 50 });
    movePlayer(player, 0.5);
    expect(player.x).toBe(100);
    expect(player.y).toBe(400);
  });
});

describe('Physics - wrapHorizontal', () => {
  it('wraps player from right to left', () => {
    const player = makePlayer({ x: CANVAS_WIDTH + 1 });
    wrapHorizontal(player, CANVAS_WIDTH);
    expect(player.x).toBe(-PLAYER_WIDTH);
  });

  it('wraps player from left to right', () => {
    const player = makePlayer({ x: -PLAYER_WIDTH - 1 });
    wrapHorizontal(player, CANVAS_WIDTH);
    expect(player.x).toBe(CANVAS_WIDTH);
  });

  it('does not wrap player in middle', () => {
    const player = makePlayer({ x: 500 });
    wrapHorizontal(player, CANVAS_WIDTH);
    expect(player.x).toBe(500);
  });
});

describe('Physics - collidePlatforms', () => {
  const platforms: Platform[] = [
    { x: 0, y: 500, width: 1280, height: 60 }, // ground
  ];

  it('lands player on platform when falling', () => {
    const player = makePlayer({ y: 490, vy: 100, state: 'airborne' });
    collidePlatforms(player, platforms);
    expect(player.y).toBe(500 - PLAYER_HEIGHT);
    expect(player.vy).toBe(0);
  });

  it('does not collide splatted players', () => {
    const player = makePlayer({ y: 520, vy: 100, state: 'splat' });
    collidePlatforms(player, platforms);
    expect(player.y).toBe(520); // unchanged
  });
});

describe('Physics - aabbOverlap', () => {
  it('returns true for overlapping boxes', () => {
    expect(aabbOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
  });

  it('returns false for non-overlapping boxes', () => {
    expect(aabbOverlap(0, 0, 10, 10, 20, 20, 10, 10)).toBe(false);
  });

  it('returns false for touching edges (not overlapping)', () => {
    expect(aabbOverlap(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
  });
});

describe('Physics - updatePlayerState', () => {
  it('sets airborne when vy is non-zero', () => {
    const player = makePlayer({ vy: 10, state: 'idle' });
    updatePlayerState(player);
    expect(player.state).toBe('airborne');
  });

  it('sets run when moving horizontally and on ground', () => {
    const player = makePlayer({ vx: 100, vy: 0, state: 'airborne' });
    updatePlayerState(player);
    expect(player.state).toBe('run');
  });

  it('sets idle when stationary on ground', () => {
    const player = makePlayer({ vx: 0, vy: 0, state: 'run' });
    updatePlayerState(player);
    expect(player.state).toBe('idle');
  });

  it('skips state update when splatted', () => {
    const player = makePlayer({ vx: 100, vy: 0, state: 'splat' });
    updatePlayerState(player);
    expect(player.state).toBe('splat');
  });
});

describe('Physics - applyArenaConstraints', () => {
  const arena: Arena = {
    name: 'Test',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    platforms: [],
    spawnPoints: [],
    backgroundColor: '#000',
    groundColor: '#000',
    platformColor: '#000',
  };

  it('prevents player from going above screen', () => {
    const player = makePlayer({ y: -10, vy: -100 });
    applyArenaConstraints(player, arena);
    expect(player.y).toBe(0);
    expect(player.vy).toBe(0);
  });

  it('prevents player from falling below screen', () => {
    const player = makePlayer({ y: CANVAS_HEIGHT + 10, vy: 100, state: 'airborne' });
    applyArenaConstraints(player, arena);
    expect(player.y).toBe(CANVAS_HEIGHT - PLAYER_HEIGHT);
    expect(player.vy).toBe(0);
  });
});
