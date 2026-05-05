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
export const FIXED_TIMESTEP = Math.fround(1 / 60); // 60fps fixed step, fround for cross-arch determinism
export const MAX_FRAME_TIME = 0.1; // prevent spiral of death

// Animation
export const ANIM_FRAME_DURATION = 0.12; // seconds per frame
export const RUN_FRAMES = 4;

// Carrot
export const CARROT_SPAWN_INTERVAL = 10; // seconds between carrot spawns
export const CARROT_FIRST_SPAWN_DELAY = 10; // seconds before first carrot
export const CARROT_CHASE_SPAWN_INTERVAL = 2; // Carrot Chase mod: faster respawn
export const CARROT_CHASE_FIRST_SPAWN_DELAY = 1; // Carrot Chase mod: fast first carrot
export const GIANT_SCALE = 1.8; // Giant Players mod: size multiplier
export const CARROT_SIZE = 30; // px (bigger sideways carrot)
export const FAT_DURATION = 6.6; // seconds
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
export const HITSTOP_DURATION = 0.12;  // ~7 frames at 60fps — per-player physics freeze on kill
export const HITSTOP_ZOOM = 0.03;      // 3% camera zoom punch during hitstop
export const HAZARD_HITSTOP_DURATION = HITSTOP_DURATION * 0.5; // ~3.5 frames — brief freeze on hazard hits

// Squash/stretch
export const SQUASH_ON_LAND = 0.7;     // squash scale on landing
export const STRETCH_ON_JUMP = 1.3;     // stretch scale on jump
export const SQUASH_ON_CROUCH = 0.6;    // squash when pressing down on ground
export const SQUASH_DECAY_SPEED = 8;    // how fast squash returns to 1.0

// Afterimage
export const AFTERIMAGE_INTERVAL = 0.03; // seconds between ghost spawns
export const AFTERIMAGE_SPEED_THRESHOLD = 200; // min speed to spawn afterimages
export const AFTERIMAGE_MAX = 5;

// Countdown
export const MATCH_COUNTDOWN = 3;       // seconds before match starts

// Idle animation
export const IDLE_FIRST_DELAY  = 0.8;   // seconds standing still before first idle action
export const IDLE_REST_MIN     = 0.6;   // min seconds between idle actions
export const IDLE_REST_MAX     = 1.4;   // max seconds between idle actions

// Shockwave
export const SHOCKWAVE_MAX_RADIUS = 60;
export const SHOCKWAVE_DURATION = 0.4;

// Screen flash
export const SCREEN_FLASH_DURATION = 0.15;

// Spring trail
export const SPRING_TRAIL_DURATION = 0.6;

// Score animation
export const SCORE_ANIM_DURATION = 0.5;

// Blood / gore
export const BLOOD_COLOR = '#CC2222';

// Gibs
export const GIB_GRAVITY = 600;           // px/s²
export const GIB_LAUNCH_SPEED_MIN = 120;  // px/s
export const GIB_LAUNCH_SPEED_MAX = 350;  // px/s
export const GIB_ROTATION_MAX = 12;       // rad/s
export const GIB_BOUNCE_FACTOR = 0.3;     // velocity retained on bounce
export const GIB_GEYSER_STRENGTH_MULT = 0.7; // gibs get 70% of player geyser force
export const GIB_MAX_FLIGHT = 5;          // max airborne seconds
export const GIB_MAX_COUNT = 150;         // grounded gibs persist forever; oldest evicted at cap

// Confetti
export const CONFETTI_COUNT = 20;
export const CONFETTI_GRAVITY = 40;       // px/s² (very light)
export const CONFETTI_FLUTTER = 80;       // px/s horizontal drift amplitude
export const CONFETTI_LIFE_MIN = 1.0;
export const CONFETTI_LIFE_MAX = 2.0;

// Hazard spawning geometry
export const SPAWN_EXCLUSION_MARGIN = 48;      // px — don't spawn hazards within this distance of a player
export const SPRING_VERTICAL_CLEARANCE = 200;   // px — minimum clearance above platform for spring bounce
export const SPAWN_RETRY_ATTEMPTS = 3;          // times to retry hazard spawn before giving up
export const THORN_WIDTH = 28;                  // px
export const THORN_HEIGHT = 12;                 // px
export const THORN_Y_OFFSET = 12;              // px above platform surface

// Match composition
export const MAX_BOT_COUNT = 4;                 // 1 human + 4 bots fills P1-P5

// Surface decals + ripples (Cosmetics Batch B)
export const SURFACE_DECAL_MAX = 30;            // cap before oldest is evicted
export const SURFACE_RIPPLE_MAX = 12;           // defensive cap on active ripples
export const SURFACE_CRACK_LIFE = 3.0;          // ice spider-cracks
export const SURFACE_GLASS_CRACK_LIFE = 2.0;    // glass cracks fade faster
export const SURFACE_MINI_CRACK_LIFE = 5.0;     // hard-landing mini crack on any surface
export const SURFACE_RIPPLE_LIFE = 0.6;         // liquid impact ripples
export const SURFACE_RIPPLE_MAX_RADIUS = 60;    // px expansion target
export const HARD_LAND_VY_THRESHOLD = 600;      // vy below this = hard land (decal trigger)

