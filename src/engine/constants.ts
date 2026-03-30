// Physics constants
export const GRAVITY = 900; // px/s²
export const MAX_WALK_SPEED = 280; // px/s
export const ACCELERATION = 1400; // px/s²
export const FRICTION = 800; // px/s² (deceleration when no input)
export const JUMP_IMPULSE = -420; // px/s (negative = upward)
export const MAX_FALL_SPEED = 600; // px/s
export const STOMP_VY_THRESHOLD = 50; // minimum downward velocity for stomp
export const STOMP_BOUNCE = -300; // upward bounce after stomp

// Player dimensions
export const PLAYER_WIDTH = 32;
export const PLAYER_HEIGHT = 32;

// Timers
export const SPLAT_DURATION = 0.4; // seconds
export const RESPAWN_DELAY = 1.0; // seconds after splat
export const INVINCIBLE_DURATION = 1.5; // seconds after respawn

// Canvas
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

// Game loop
export const FIXED_TIMESTEP = 1 / 60; // 60fps fixed step
export const MAX_FRAME_TIME = 0.1; // prevent spiral of death

// Animation
export const ANIM_FRAME_DURATION = 0.12; // seconds per frame
export const RUN_FRAMES = 4;
