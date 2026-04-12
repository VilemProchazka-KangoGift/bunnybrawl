/**
 * Validates that physics and gameplay constants match documented values.
 * These tests catch accidental constant changes that would break game feel.
 */
import { describe, it, expect } from 'vitest';
import {
  // Physics
  GRAVITY, MAX_WALK_SPEED, ACCELERATION, FRICTION,
  JUMP_IMPULSE, MAX_FALL_SPEED, FAST_FALL_GRAVITY, FAST_FALL_SPEED, FAST_FALL_INITIAL,
  PLAYER_PUSH_FORCE,
  // Player dimensions
  PLAYER_WIDTH, PLAYER_HEIGHT,
  // Canvas
  CANVAS_WIDTH, CANVAS_HEIGHT,
  // Stomp
  STOMP_VY_THRESHOLD, STOMP_BOUNCE, SPLAT_DURATION, RESPAWN_DELAY, INVINCIBLE_DURATION,
  // Hazards
  SPRING_BOUNCE, THORN_SLOW_DURATION,
  HAZARD_LIFETIME, SPRING_SPAWN_INTERVAL, THORN_SPAWN_INTERVAL,
  CARROT_FIRST_SPAWN_DELAY,
  // Modifiers
  FAT_SPEED_MULT, FAT_JUMP_MULT, THORN_SPEED_MULT, THORN_JUMP_MULT,
  FAT_DURATION,
  // Match
  MATCH_COUNTDOWN, FIXED_TIMESTEP,
  // Visual
  DUST_LAND_VY_THRESHOLD,
} from './constants';

describe('Physics constants', () => {
  it('GRAVITY = 900 px/s²', () => expect(GRAVITY).toBe(900));
  it('MAX_WALK_SPEED = 280 px/s', () => expect(MAX_WALK_SPEED).toBe(280));
  it('ACCELERATION = 1400 px/s²', () => expect(ACCELERATION).toBe(1400));
  it('FRICTION = 800 px/s²', () => expect(FRICTION).toBe(800));
  it('JUMP_IMPULSE = -560 px/s', () => expect(JUMP_IMPULSE).toBe(-560));
  it('MAX_FALL_SPEED = 600 px/s', () => expect(MAX_FALL_SPEED).toBe(600));
  it('FAST_FALL_GRAVITY = 2400 px/s² (2.67x normal)', () => {
    expect(FAST_FALL_GRAVITY).toBe(2400);
    expect(FAST_FALL_GRAVITY / GRAVITY).toBeCloseTo(2.67, 1);
  });
  it('FAST_FALL_SPEED = 900 px/s (1.5x normal)', () => {
    expect(FAST_FALL_SPEED).toBe(900);
    expect(FAST_FALL_SPEED / MAX_FALL_SPEED).toBe(1.5);
  });
  it('PLAYER_PUSH_FORCE = 200 px/s', () => expect(PLAYER_PUSH_FORCE).toBe(200));
});

describe('Player dimensions', () => {
  it('PLAYER_WIDTH = 32', () => expect(PLAYER_WIDTH).toBe(32));
  it('PLAYER_HEIGHT = 32', () => expect(PLAYER_HEIGHT).toBe(32));
});

describe('Canvas dimensions', () => {
  it('CANVAS_WIDTH = 1280', () => expect(CANVAS_WIDTH).toBe(1280));
  it('CANVAS_HEIGHT = 720', () => expect(CANVAS_HEIGHT).toBe(720));
  it('logical resolution is 16:9', () => {
    expect(CANVAS_WIDTH / CANVAS_HEIGHT).toBeCloseTo(16 / 9, 2);
  });
});

describe('Stomp/kill constants', () => {
  it('STOMP_VY_THRESHOLD = 50 px/s', () => expect(STOMP_VY_THRESHOLD).toBe(50));
  it('STOMP_BOUNCE = -400 px/s (upward bounce after kill)', () => expect(STOMP_BOUNCE).toBe(-400));
  it('SPLAT_DURATION = 0.4s', () => expect(SPLAT_DURATION).toBe(0.4));
  it('RESPAWN_DELAY = 1.0s', () => expect(RESPAWN_DELAY).toBe(1));
  it('INVINCIBLE_DURATION = 1.5s', () => expect(INVINCIBLE_DURATION).toBe(1.5));
});

describe('Hazard constants', () => {
  it('SPRING_BOUNCE = -700 px/s', () => expect(SPRING_BOUNCE).toBe(-700));
  it('THORN_SLOW_DURATION = 5s', () => expect(THORN_SLOW_DURATION).toBe(5));
});

describe('Modifier constants', () => {
  it('FAT_SPEED_MULT = 0.6 (60% walk speed)', () => expect(FAT_SPEED_MULT).toBe(0.6));
  it('FAT_JUMP_MULT = 0.8 (80% jump height)', () => expect(FAT_JUMP_MULT).toBe(0.8));
  it('THORN_SPEED_MULT = 0.5 (50% walk speed)', () => expect(THORN_SPEED_MULT).toBe(0.5));
  it('THORN_JUMP_MULT = 0.7 (70% jump height)', () => expect(THORN_JUMP_MULT).toBe(0.7));
  it('FAT_DURATION = 6.6s', () => expect(FAT_DURATION).toBe(6.6));
});

describe('Match timing constants', () => {
  it('FIXED_TIMESTEP = 1/60 (60fps)', () => expect(FIXED_TIMESTEP).toBeCloseTo(1 / 60, 6));
  it('MATCH_COUNTDOWN = 3s', () => expect(MATCH_COUNTDOWN).toBe(3));
});

describe('Derived physics relationships', () => {
  it('max jump height ≈ 174px (JUMP_IMPULSE² / 2*GRAVITY)', () => {
    // h = v² / (2g) where v = |JUMP_IMPULSE|, g = GRAVITY
    const maxHeight = (JUMP_IMPULSE * JUMP_IMPULSE) / (2 * GRAVITY);
    expect(maxHeight).toBeCloseTo(174, 0);
  });

  it('time to reach max jump height ≈ 0.62s', () => {
    // t = |v| / g
    const timeToApex = Math.abs(JUMP_IMPULSE) / GRAVITY;
    expect(timeToApex).toBeCloseTo(0.62, 1);
  });

  it('time to fall one screen height (720px) from rest ≈ 1.26s', () => {
    // t = sqrt(2h/g) — ignoring terminal velocity
    const timeFull = Math.sqrt(2 * CANVAS_HEIGHT / GRAVITY);
    expect(timeFull).toBeCloseTo(1.26, 1);
  });

  it('fat walk speed = 168 px/s', () => {
    expect(MAX_WALK_SPEED * FAT_SPEED_MULT).toBe(168);
  });

  it('thorn walk speed = 140 px/s', () => {
    expect(MAX_WALK_SPEED * THORN_SPEED_MULT).toBe(140);
  });

  it('fat jump impulse = -448 px/s', () => {
    expect(JUMP_IMPULSE * FAT_JUMP_MULT).toBeCloseTo(-448, 0);
  });

  it('thorn jump impulse = -392 px/s', () => {
    expect(JUMP_IMPULSE * THORN_JUMP_MULT).toBeCloseTo(-392, 0);
  });

  it('fast fall is 2.67x normal gravity', () => {
    expect(FAST_FALL_GRAVITY / GRAVITY).toBeCloseTo(2.67, 1);
  });

  it('fast fall max speed is 1.5x normal max fall speed', () => {
    expect(FAST_FALL_SPEED / MAX_FALL_SPEED).toBe(1.5);
  });

  it('spring bounce exceeds jump impulse (more powerful than jump)', () => {
    expect(Math.abs(SPRING_BOUNCE)).toBeGreaterThan(Math.abs(JUMP_IMPULSE));
  });

  it('stomp bounce is weaker than jump impulse', () => {
    expect(Math.abs(STOMP_BOUNCE)).toBeLessThan(Math.abs(JUMP_IMPULSE));
  });

  it('total respawn time = SPLAT_DURATION + RESPAWN_DELAY = 1.4s', () => {
    expect(SPLAT_DURATION + RESPAWN_DELAY).toBe(1.4);
  });

  it('invincibility exceeds total respawn time', () => {
    expect(INVINCIBLE_DURATION).toBeGreaterThan(SPLAT_DURATION + RESPAWN_DELAY);
  });

  it('60fps timestep is approximately 16.67ms', () => {
    expect(FIXED_TIMESTEP * 1000).toBeCloseTo(16.67, 0);
  });

  it('friction stops a max-speed player in ~0.35s', () => {
    // time = speed / friction
    const stopTime = MAX_WALK_SPEED / FRICTION;
    expect(stopTime).toBeCloseTo(0.35, 1);
  });

  it('player is square (width == height)', () => {
    expect(PLAYER_WIDTH).toBe(PLAYER_HEIGHT);
  });
});

describe('Spawn timing constants', () => {
  it('CARROT_FIRST_SPAWN_DELAY < SPRING_SPAWN_INTERVAL', () => {
    expect(CARROT_FIRST_SPAWN_DELAY).toBeLessThan(SPRING_SPAWN_INTERVAL);
  });

  it('HAZARD_LIFETIME is finite', () => {
    expect(HAZARD_LIFETIME).toBeGreaterThan(0);
    expect(HAZARD_LIFETIME).toBeLessThan(Infinity);
  });
});
