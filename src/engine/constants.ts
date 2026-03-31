// Physics constants
export const GRAVITY = 900; // px/s²
export const MAX_WALK_SPEED = 280; // px/s
export const ACCELERATION = 1400; // px/s²
export const FRICTION = 800; // px/s² (deceleration when no input)
export const JUMP_IMPULSE = -560; // px/s (negative = upward) → ~174px max jump height
export const MAX_FALL_SPEED = 600; // px/s
export const FAST_FALL_GRAVITY = 2400; // px/s² (much heavier when holding down)
export const FAST_FALL_SPEED = 900; // px/s max speed when fast-falling
export const FAST_FALL_INITIAL = 500; // px/s immediate downward snap when pressing down
export const DUST_LAND_VY_THRESHOLD = 300; // minimum landing speed to spawn dust
export const PLAYER_PUSH_FORCE = 200; // px/s push speed when players collide
export const STOMP_VY_THRESHOLD = 50; // minimum downward velocity for stomp
export const STOMP_BOUNCE = -400; // upward bounce after stomp

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

// Carrot
export const CARROT_SPAWN_INTERVAL = 10; // seconds between carrot spawns
export const CARROT_SIZE = 30; // px (bigger sideways carrot)
export const FAT_DURATION = 10; // seconds
export const FAT_SCALE = 1.4; // size multiplier when fat
export const FAT_SPEED_MULT = 0.6; // speed multiplier when fat
export const FAT_JUMP_MULT = 0.8; // jump multiplier when fat (still reachable)

// Spring mushroom
export const SPRING_BOUNCE = -700; // px/s upward bounce on spring
export const SPRING_SIZE = 20; // px

// Thorn
export const THORN_SLOW_DURATION = 5; // seconds
export const THORN_SPEED_MULT = 0.5; // speed while slowed
export const THORN_JUMP_MULT = 0.7; // jump while slowed

// Hazard spawning
export const SPRING_SPAWN_INTERVAL = 12; // seconds between spring spawns
export const THORN_SPAWN_INTERVAL = 15; // seconds between thorn spawns
export const HAZARD_LIFETIME = 20; // seconds before despawn
export const HAZARD_GROW_TIME = 0.5; // seconds for grow-in animation

// Screen effects
export const SCREEN_SHAKE_DURATION = 0.3; // seconds
export const SCREEN_SHAKE_INTENSITY = 6; // pixels
export const SLOW_MO_DURATION = 1.0; // seconds for final kill slow-mo
export const SLOW_MO_FACTOR = 0.25; // time scale during slow-mo

// Weather
export const WEATHER_PARTICLE_COUNT = 30;

// Squash/stretch
export const SQUASH_ON_LAND = 0.7;     // squash scale on landing
export const STRETCH_ON_JUMP = 1.3;     // stretch scale on jump
export const SQUASH_ON_CROUCH = 0.6;    // squash when pressing down on ground
export const SQUASH_DECAY_SPEED = 8;    // how fast squash returns to 1.0

// Afterimage
export const AFTERIMAGE_INTERVAL = 0.03; // seconds between ghost spawns
export const AFTERIMAGE_SPEED_THRESHOLD = 200; // min speed to spawn afterimages
export const AFTERIMAGE_MAX = 5;

// Day/night
export const DAY_CYCLE_DURATION = 120;  // seconds for full day/night cycle

// Countdown
export const MATCH_COUNTDOWN = 3;       // seconds before match starts

// Idle animation
export const IDLE_ANIM_INTERVAL = 3;    // seconds between idle animations

// Shockwave
export const SHOCKWAVE_MAX_RADIUS = 60;
export const SHOCKWAVE_DURATION = 0.4;

// Screen flash
export const SCREEN_FLASH_DURATION = 0.15;

// Spring trail
export const SPRING_TRAIL_DURATION = 0.6;

// Score animation
export const SCORE_ANIM_DURATION = 0.5;

// Wildlife
export const WILDLIFE_COUNT = 5;

// Fog
export const FOG_PARTICLE_COUNT = 20;

// Pollen
export const POLLEN_COUNT = 12;
