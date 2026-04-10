import { describe, it, expect } from 'vitest';
import {
  applyInput, applyGravity, movePlayer, wrapHorizontal,
  collidePlatforms, updatePlayerState, aabbOverlap, applyArenaConstraints,
  getSpeedMult, getJumpMult, collidePlayersHorizontal, checkOnGround,
  resolveStuckPlayer, applySimpleGravity, moveSimple,
} from './physics';
import type { Platform, Arena, InputState } from './types';
import {
  GRAVITY, MAX_WALK_SPEED, ACCELERATION, FRICTION,
  JUMP_IMPULSE, PLAYER_WIDTH, PLAYER_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT,
  MAX_FALL_SPEED, FAST_FALL_GRAVITY, FAST_FALL_SPEED, FAST_FALL_INITIAL,
  FAT_SPEED_MULT, FAT_JUMP_MULT, THORN_SPEED_MULT, THORN_JUMP_MULT,
  PLAYER_PUSH_FORCE,
} from './constants';
import { makePlayer } from './__tests__/testHelpers';

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

// ===================================================================
// Speed/Jump multipliers
// ===================================================================

describe('getSpeedMult / getJumpMult', () => {
  it('getSpeedMult returns FAT_SPEED_MULT when fat', () => {
    const p = makePlayer({ fatTimer: 3 });
    expect(getSpeedMult(p)).toBe(FAT_SPEED_MULT);
  });

  it('getSpeedMult returns THORN_SPEED_MULT when slowed', () => {
    const p = makePlayer({ slowTimer: 2 });
    expect(getSpeedMult(p)).toBe(THORN_SPEED_MULT);
  });

  it('getSpeedMult returns 1 when neither fat nor slowed', () => {
    const p = makePlayer();
    expect(getSpeedMult(p)).toBe(1);
  });

  it('getSpeedMult: fat takes priority over slow', () => {
    const p = makePlayer({ fatTimer: 3, slowTimer: 2 });
    expect(getSpeedMult(p)).toBe(FAT_SPEED_MULT);
  });

  it('getJumpMult returns FAT_JUMP_MULT when fat', () => {
    const p = makePlayer({ fatTimer: 3 });
    expect(getJumpMult(p)).toBe(FAT_JUMP_MULT);
  });

  it('getJumpMult returns THORN_JUMP_MULT when slowed', () => {
    const p = makePlayer({ slowTimer: 2 });
    expect(getJumpMult(p)).toBe(THORN_JUMP_MULT);
  });

  it('getJumpMult returns 1 when normal', () => {
    const p = makePlayer();
    expect(getJumpMult(p)).toBe(1);
  });
});

// ===================================================================
// Fast fall
// ===================================================================

describe('Fast Fall', () => {
  it('fastFalling uses FAST_FALL_GRAVITY instead of normal gravity', () => {
    const normal = makePlayer({ state: 'airborne', vy: 100 });
    const fast = makePlayer({ state: 'airborne', vy: 100, fastFalling: true });
    applyGravity(normal, 1 / 60);
    applyGravity(fast, 1 / 60);
    expect(fast.vy).toBeGreaterThan(normal.vy);
  });

  it('fastFalling caps at FAST_FALL_SPEED', () => {
    const p = makePlayer({ state: 'airborne', vy: FAST_FALL_SPEED - 10, fastFalling: true });
    applyGravity(p, 1 / 60);
    expect(p.vy).toBeLessThanOrEqual(FAST_FALL_SPEED);
  });

  it('first frame of fast-fall snaps vy to at least FAST_FALL_INITIAL', () => {
    const p = makePlayer({ state: 'airborne', vy: -200, fastFalling: false });
    applyInput(p, { left: false, right: false, jump: false, down: true }, 1 / 60);
    expect(p.vy).toBeGreaterThanOrEqual(FAST_FALL_INITIAL);
    expect(p.fastFalling).toBe(true);
  });

  it('fastFalling clears on ground', () => {
    const p = makePlayer({ state: 'idle', fastFalling: true });
    applyInput(p, { left: false, right: false, jump: false, down: true }, 1 / 60);
    // down on ground doesn't set fastFalling
    expect(p.fastFalling).toBe(false);
  });
});

// ===================================================================
// Fat/slow modifiers on input
// ===================================================================

describe('Fat and Slow input modifiers', () => {
  it('fat player has reduced max walk speed', () => {
    const normal = makePlayer({ vx: MAX_WALK_SPEED + 100 });
    const fat = makePlayer({ vx: MAX_WALK_SPEED + 100, fatTimer: 5 });
    applyInput(normal, { left: false, right: true, jump: false, down: false }, 1 / 60);
    applyInput(fat, { left: false, right: true, jump: false, down: false }, 1 / 60);
    expect(fat.vx).toBeLessThan(normal.vx);
    expect(fat.vx).toBeLessThanOrEqual(MAX_WALK_SPEED * FAT_SPEED_MULT);
  });

  it('slowed player has reduced max walk speed', () => {
    const normal = makePlayer({ vx: MAX_WALK_SPEED + 100 });
    const slow = makePlayer({ vx: MAX_WALK_SPEED + 100, slowTimer: 3 });
    applyInput(normal, { left: false, right: true, jump: false, down: false }, 1 / 60);
    applyInput(slow, { left: false, right: true, jump: false, down: false }, 1 / 60);
    expect(slow.vx).toBeLessThan(normal.vx);
    expect(slow.vx).toBeLessThanOrEqual(MAX_WALK_SPEED * THORN_SPEED_MULT);
  });

  it('fat player has reduced jump impulse', () => {
    const normal = makePlayer({ state: 'idle' });
    const fat = makePlayer({ state: 'idle', fatTimer: 5 });
    applyInput(normal, { left: false, right: false, jump: true, down: false }, 1 / 60);
    applyInput(fat, { left: false, right: false, jump: true, down: false }, 1 / 60);
    // Both jump upward (negative vy) but fat jumps less
    expect(Math.abs(fat.vy)).toBeLessThan(Math.abs(normal.vy));
  });

  it('slowed player has reduced jump impulse', () => {
    const normal = makePlayer({ state: 'idle' });
    const slow = makePlayer({ state: 'idle', slowTimer: 3 });
    applyInput(normal, { left: false, right: false, jump: true, down: false }, 1 / 60);
    applyInput(slow, { left: false, right: false, jump: true, down: false }, 1 / 60);
    expect(Math.abs(slow.vy)).toBeLessThan(Math.abs(normal.vy));
  });
});

// ===================================================================
// Player-player collision
// ===================================================================

describe('collidePlayersHorizontal', () => {
  it('pushes overlapping players apart', () => {
    const a = makePlayer({ id: 'P1', x: 100, y: 600, state: 'idle', active: true, invincibleTimer: 0 });
    const b = makePlayer({ id: 'P2', x: 110, y: 600, state: 'idle', active: true, invincibleTimer: 0 });
    const xA = a.x, xB = b.x;
    collidePlayersHorizontal([a, b]);
    // After collision, they should be pushed apart
    expect(a.x).toBeLessThan(xA);
    expect(b.x).toBeGreaterThan(xB);
  });

  it('sets sideSquash to 0.8 on push', () => {
    const a = makePlayer({ id: 'P1', x: 100, y: 600, state: 'idle', active: true, invincibleTimer: 0 });
    const b = makePlayer({ id: 'P2', x: 110, y: 600, state: 'idle', active: true, invincibleTimer: 0 });
    collidePlayersHorizontal([a, b]);
    expect(a.sideSquash).toBe(0.8);
    expect(b.sideSquash).toBe(0.8);
  });

  it('skips collision for splatted players', () => {
    const a = makePlayer({ id: 'P1', x: 100, y: 600, state: 'splat', active: true });
    const b = makePlayer({ id: 'P2', x: 110, y: 600, state: 'idle', active: true });
    const xA = a.x;
    collidePlayersHorizontal([a, b]);
    expect(a.x).toBe(xA); // no push
  });

  it('skips collision for invincible players', () => {
    const a = makePlayer({ id: 'P1', x: 100, y: 600, state: 'idle', active: true, invincibleTimer: 1.0 });
    const b = makePlayer({ id: 'P2', x: 110, y: 600, state: 'idle', active: true, invincibleTimer: 0 });
    const xA = a.x;
    collidePlayersHorizontal([a, b]);
    expect(a.x).toBe(xA);
  });

  it('skips collision when vertical overlap < 50% (stomp zone)', () => {
    const a = makePlayer({ id: 'P1', x: 100, y: 600, state: 'idle', active: true, invincibleTimer: 0 });
    const b = makePlayer({ id: 'P2', x: 110, y: 600 - PLAYER_HEIGHT + 5, state: 'airborne', active: true, invincibleTimer: 0 });
    // b is mostly above a — vertical overlap is small (stomp territory)
    const xA = a.x;
    collidePlayersHorizontal([a, b]);
    expect(a.x).toBe(xA); // no horizontal push
  });
});

// ===================================================================
// checkOnGround
// ===================================================================

describe('checkOnGround', () => {
  const ground: Platform = { x: 0, y: 660, width: 1280, height: 20 };

  it('returns true when player feet are at platform top', () => {
    const p = makePlayer({ y: 660 - PLAYER_HEIGHT }); // feet exactly at platform top
    expect(checkOnGround(p, [ground])).toBe(true);
  });

  it('returns false when player is above platform', () => {
    const p = makePlayer({ y: 600 }); // feet at 632, well above 660
    expect(checkOnGround(p, [ground])).toBe(false);
  });

  it('returns false when player is off to the side', () => {
    const narrow: Platform = { x: 500, y: 660, width: 100, height: 20 };
    const p = makePlayer({ x: 200, y: 660 - PLAYER_HEIGHT }); // correct y but wrong x
    expect(checkOnGround(p, [narrow])).toBe(false);
  });
});

// ===================================================================
// resolveStuckPlayer
// ===================================================================

describe('resolveStuckPlayer', () => {
  it('ejects deeply embedded player from platform', () => {
    const plat: Platform = { x: 100, y: 500, width: 200, height: 20 };
    // Player deeply inside the platform (overlap > 5px)
    const p = makePlayer({ x: 150, y: 505, state: 'idle', active: true });
    resolveStuckPlayer(p, [plat]);
    // Should have been ejected — y should be different
    expect(p.y !== 505 || p.x !== 150).toBe(true);
  });

  it('does not eject for shallow overlap (<=5px)', () => {
    const plat: Platform = { x: 100, y: 500, width: 200, height: 20 };
    // Just barely overlapping top edge (~3px overlap)
    const p = makePlayer({ x: 150, y: 500 - PLAYER_HEIGHT + 3, state: 'idle', active: true });
    const yBefore = p.y;
    resolveStuckPlayer(p, [plat]);
    expect(p.y).toBe(yBefore); // not ejected
  });

  it('skips splatted players', () => {
    const plat: Platform = { x: 100, y: 500, width: 200, height: 20 };
    const p = makePlayer({ x: 150, y: 505, state: 'splat', active: true });
    const yBefore = p.y;
    resolveStuckPlayer(p, [plat]);
    expect(p.y).toBe(yBefore);
  });
});

// ===================================================================
// Simple physics (lobby)
// ===================================================================

describe('Simple physics (lobby)', () => {
  it('applySimpleGravity increases vy toward maxFallSpeed', () => {
    const body = { x: 0, y: 0, vx: 0, vy: 0 };
    applySimpleGravity(body, 900, 600, 1 / 60);
    expect(body.vy).toBeGreaterThan(0);
    expect(body.vy).toBeLessThanOrEqual(600);
  });

  it('applySimpleGravity caps at maxFallSpeed', () => {
    const body = { x: 0, y: 0, vx: 0, vy: 590 };
    applySimpleGravity(body, 900, 600, 1 / 60);
    expect(body.vy).toBe(600);
  });

  it('moveSimple moves body by velocity * dt', () => {
    const body = { x: 100, y: 200, vx: 60, vy: 30 };
    moveSimple(body, 1 / 60);
    expect(body.x).toBeCloseTo(101, 0);
    expect(body.y).toBeCloseTo(200.5, 0);
  });
});

// ===================================================================
// Wall collision side squash
// ===================================================================

describe('Wall collision side squash', () => {
  it('sets sideSquash to 0.75 on left wall collision', () => {
    const plat: Platform = { x: 200, y: 500, width: 100, height: 100 };
    const p = makePlayer({ x: 200 - PLAYER_WIDTH + 5, y: 530, vx: 50, state: 'idle', active: true });
    collidePlatforms(p, [plat]);
    expect(p.sideSquash).toBe(0.75);
    expect(p.vx).toBe(0);
  });

  it('sets sideSquash to 0.75 on right wall collision', () => {
    const plat: Platform = { x: 200, y: 500, width: 100, height: 100 };
    const p = makePlayer({ x: 300 - 5, y: 530, vx: -50, state: 'idle', active: true });
    collidePlatforms(p, [plat]);
    expect(p.sideSquash).toBe(0.75);
    expect(p.vx).toBe(0);
  });
});

// ===================================================================
// Head bonk (ceiling collision)
// ===================================================================

describe('Ceiling collision (head bonk)', () => {
  it('stops upward velocity on hitting platform bottom', () => {
    // Platform bottom at y=420. Player head at y (player occupies y to y+height).
    // Place player so head hits bottom: player.y slightly above plat bottom
    const plat: Platform = { x: 100, y: 400, width: 200, height: 20 };
    // Player at y=418 means top of player is at 418, bottom at 418+32=450
    // This overlaps with platform (400-420). overlapBottom = 420 - 418 = 2
    // overlapTop = 450 - 400 = 50
    // minOverlap = overlapBottom = 2, vy < 0 → head bonk
    const p = makePlayer({ x: 150, y: 418, vy: -200, state: 'airborne', active: true });
    collidePlatforms(p, [plat]);
    expect(p.vy).toBe(0);
    expect(p.y).toBe(420); // pushed to bottom of platform
  });
});

// ===================================================================
// Constants validation
// ===================================================================

describe('Physics constants validation', () => {
  it('GRAVITY is 900', () => expect(GRAVITY).toBe(900));
  it('MAX_WALK_SPEED is 280', () => expect(MAX_WALK_SPEED).toBe(280));
  it('JUMP_IMPULSE is -560', () => expect(JUMP_IMPULSE).toBe(-560));
  it('MAX_FALL_SPEED is 600', () => expect(MAX_FALL_SPEED).toBe(600));
  it('FAST_FALL_GRAVITY is 2400', () => expect(FAST_FALL_GRAVITY).toBe(2400));
  it('FAST_FALL_SPEED is 900', () => expect(FAST_FALL_SPEED).toBe(900));
  it('ACCELERATION is 1400', () => expect(ACCELERATION).toBe(1400));
  it('FRICTION is 800', () => expect(FRICTION).toBe(800));
  it('FAT_SPEED_MULT is 0.6', () => expect(FAT_SPEED_MULT).toBe(0.6));
  it('FAT_JUMP_MULT is 0.8', () => expect(FAT_JUMP_MULT).toBe(0.8));
  it('THORN_SPEED_MULT is 0.5', () => expect(THORN_SPEED_MULT).toBe(0.5));
  it('THORN_JUMP_MULT is 0.7', () => expect(THORN_JUMP_MULT).toBe(0.7));
  it('PLAYER_PUSH_FORCE is 200', () => expect(PLAYER_PUSH_FORCE).toBe(200));
});
