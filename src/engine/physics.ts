import type { Player, Platform, Arena } from './types';
import {
  GRAVITY, MAX_WALK_SPEED, ACCELERATION, FRICTION,
  JUMP_IMPULSE, MAX_FALL_SPEED, FAST_FALL_GRAVITY, FAST_FALL_SPEED,
  FAST_FALL_INITIAL, PLAYER_PUSH_FORCE,
  FAT_SPEED_MULT, FAT_JUMP_MULT, THORN_SPEED_MULT, THORN_JUMP_MULT,
} from './constants';
import type { InputState } from './types';

/** Force 32-bit float for cross-architecture determinism (x86 80-bit vs ARM 64-bit). */
const f = Math.fround;

// ---------------------------------------------------------------------------
// Generic physics primitives (no Math.fround)
// Used by non-deterministic contexts like the lobby. Match physics functions
// (applyGravity, movePlayer) use fround for network determinism — don't replace.
// ---------------------------------------------------------------------------

/** Minimal physics entity — shared between match Player and lobby LobbyPlayer. */
export interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Apply gravity to any physics body. No fround — use applyGravity for deterministic match physics. */
export function applySimpleGravity(body: PhysicsBody, gravity: number, maxFallSpeed: number, dt: number): void {
  body.vy += gravity * dt;
  if (body.vy > maxFallSpeed) body.vy = maxFallSpeed;
}

/** Move any physics body by its velocity. No fround — use movePlayer for deterministic match physics. */
export function moveSimple(body: PhysicsBody, dt: number): void {
  body.x += body.vx * dt;
  body.y += body.vy * dt;
}

export function getSpeedMult(player: Player): number {
  if (player.fatTimer > 0) return FAT_SPEED_MULT;
  if (player.slowTimer > 0) return THORN_SPEED_MULT;
  return 1;
}

export function getJumpMult(player: Player): number {
  if (player.fatTimer > 0) return FAT_JUMP_MULT;
  if (player.slowTimer > 0) return THORN_JUMP_MULT;
  return 1;
}

export function applyInput(
  player: Player, input: InputState, dt: number,
  maxWalkSpeed = MAX_WALK_SPEED, friction = FRICTION, jumpImpulse = JUMP_IMPULSE,
): void {
  if (player.state === 'splat' || player.state === 'respawning') return;

  const speedMult = getSpeedMult(player);
  const maxSpeed = maxWalkSpeed * speedMult;

  // Horizontal movement
  if (input.left) {
    player.vx = f(player.vx - f(ACCELERATION * dt));
    player.facing = 'left';
  } else if (input.right) {
    player.vx = f(player.vx + f(ACCELERATION * dt));
    player.facing = 'right';
  } else {
    if (player.vx > 0) {
      player.vx = f(Math.max(0, f(player.vx - f(friction * dt))));
    } else if (player.vx < 0) {
      player.vx = f(Math.min(0, f(player.vx + f(friction * dt))));
    }
  }

  // Clamp horizontal speed
  player.vx = f(Math.max(-maxSpeed, Math.min(maxSpeed, player.vx)));

  // Fast fall — hold down while airborne: instant direction change
  if (input.down && player.state === 'airborne') {
    if (!player.fastFalling) {
      // First frame of fast-fall: snap velocity downward immediately
      player.vy = f(Math.max(player.vy, FAST_FALL_INITIAL));
    }
    player.fastFalling = true;
  } else {
    player.fastFalling = false;
  }

  // Jump (only if on ground)
  if (input.jump && player.state !== 'airborne') {
    player.vy = f(jumpImpulse * getJumpMult(player));
    player.state = 'airborne';
  }
}

export function applyGravity(player: Player, dt: number, gravity = GRAVITY, maxFallSpeed = MAX_FALL_SPEED): void {
  if (player.state === 'splat' || player.state === 'respawning') return;

  const g = player.fastFalling ? FAST_FALL_GRAVITY : gravity;
  const maxFall = player.fastFalling ? FAST_FALL_SPEED : maxFallSpeed;

  player.vy = f(player.vy + f(g * dt));
  player.vy = f(Math.min(player.vy, maxFall));
}

export function movePlayer(player: Player, dt: number): void {
  if (player.state === 'splat' || player.state === 'respawning') return;
  player.x = f(player.x + f(player.vx * dt));
  player.y = f(player.y + f(player.vy * dt));
}

export function wrapHorizontal(player: Player, arenaWidth: number): void {
  if (player.x + player.width < 0) {
    player.x = arenaWidth;
  } else if (player.x > arenaWidth) {
    player.x = -player.width;
  }
}

export function collidePlatforms(player: Player, platforms: Platform[]): void {
  if (player.state === 'splat' || player.state === 'respawning') return;

  for (const plat of platforms) {
    if (aabbOverlap(
      player.x, player.y, player.width, player.height,
      plat.x, plat.y, plat.width, plat.height
    )) {
      // Determine collision direction
      const overlapLeft = (player.x + player.width) - plat.x;
      const overlapRight = (plat.x + plat.width) - player.x;
      const overlapTop = (player.y + player.height) - plat.y;
      const overlapBottom = (plat.y + plat.height) - player.y;

      // Prefer top landing when player feet are near platform top —
      // prevents shaking at platform edges where side and top overlap compete.
      // But only when horizontal penetration exceeds vertical (came from above,
      // not walking into the side of a tall block).
      const feetNearTop = overlapTop < player.height * 0.5;
      const sideOverlap = Math.min(overlapLeft, overlapRight);
      const landingFromAbove = feetNearTop && sideOverlap > overlapTop;
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

      if ((minOverlap === overlapTop || landingFromAbove) && player.vy >= 0 && overlapTop < overlapBottom) {
        // Landing on top
        player.y = plat.y - player.height;
        player.vy = 0;
        if (player.state === 'airborne') {
          player.state = player.vx !== 0 ? 'run' : 'idle';
        }
        player.fastFalling = false;
      } else if (minOverlap === overlapBottom && player.vy < 0) {
        // Hitting bottom (head bump) — just stop upward motion
        player.y = plat.y + plat.height;
        player.vy = 0;
      } else if (minOverlap === overlapLeft) {
        player.x = plat.x - player.width;
        if (player.vx > 0) { player.sideSquash = 0.75; player.vx = 0; }
      } else if (minOverlap === overlapRight) {
        player.x = plat.x + plat.width;
        if (player.vx < 0) { player.sideSquash = 0.75; player.vx = 0; }
      } else {
        // Fallback: deeply embedded or ambiguous — eject via smallest overlap
        if (overlapTop <= overlapBottom) {
          player.y = plat.y - player.height;
          player.vy = 0;
        } else {
          player.y = plat.y + plat.height;
          player.vy = 0;
        }
      }
    }
  }
}

export function updatePlayerState(player: Player): void {
  if (player.state === 'splat' || player.state === 'respawning') return;

  if (player.vy !== 0) {
    player.state = 'airborne';
  } else if (Math.abs(player.vx) > 10) {
    player.state = 'run';
  } else {
    player.state = 'idle';
  }
}

export function checkOnGround(player: Player, platforms: Platform[]): boolean {
  const feetY = player.y + player.height;
  for (const plat of platforms) {
    if (
      player.x + player.width > plat.x &&
      player.x < plat.x + plat.width &&
      feetY >= plat.y - 2 &&
      feetY <= plat.y + 2
    ) {
      return true;
    }
  }
  return false;
}

export function aabbOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function collidePlayersHorizontal(players: Player[]): void {
  // Small inset so sprites visually touch before the wall kicks in
  const margin = 4;

  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (!a.active || a.state === 'splat' || a.state === 'respawning') continue;
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (!b.active || b.state === 'splat' || b.state === 'respawning') continue;
      if (a.invincibleTimer > 0 || b.invincibleTimer > 0) continue;

      // Skip if one is above the other (stomp zone)
      const vertOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (vertOverlap < a.height * 0.5) continue;

      // Check overlap using inset boxes
      const aLeft = a.x + margin;
      const aRight = a.x + a.width - margin;
      const bLeft = b.x + margin;
      const bRight = b.x + b.width - margin;

      if (aRight > bLeft && aLeft < bRight) {
        // Overlapping — hard separate
        const aCx = a.x + a.width / 2;
        const bCx = b.x + b.width / 2;
        const halfW = (a.width - margin * 2) / 2 + (b.width - margin * 2) / 2;
        const dist = Math.abs(aCx - bCx);
        const overlap = halfW - dist;

        if (overlap > 0) {
          const half = f(f(overlap / 2) + 0.5);
          if (aCx <= bCx) {
            a.x = f(a.x - half);
            b.x = f(b.x + half);
          } else {
            a.x = f(a.x + half);
            b.x = f(b.x - half);
          }

          // Velocity exchange: transfer momentum
          const avgVx = f((a.vx + b.vx) / 2);
          a.vx = f(avgVx - f(PLAYER_PUSH_FORCE * (aCx <= bCx ? 0.3 : -0.3)));
          b.vx = f(avgVx + f(PLAYER_PUSH_FORCE * (aCx <= bCx ? 0.3 : -0.3)));
          // Side squash both characters on push
          a.sideSquash = 0.8;
          b.sideSquash = 0.8;
        }
      }
    }
  }
}

export function applyArenaConstraints(player: Player, arena: Arena): void {
  if (player.y < 0) {
    player.y = 0;
    player.vy = f(Math.max(player.vy, 0));
  }
  if (!arena.allowFallOff && player.y + player.height > arena.height) {
    player.y = arena.height - player.height;
    player.vy = 0;
    if (player.state === 'airborne') {
      player.state = player.vx !== 0 ? 'run' : 'idle';
    }
    player.fastFalling = false;
  }

  wrapHorizontal(player, arena.width);
}

/**
 * Failsafe: if a player is deeply embedded in a platform (>5px overlap),
 * eject them to the nearest surface. Catches desync-related position errors.
 */
export function resolveStuckPlayer(player: Player, platforms: Platform[]): void {
  if (!player.active || player.state === 'splat' || player.state === 'respawning') return;

  for (const plat of platforms) {
    if (!aabbOverlap(
      player.x, player.y, player.width, player.height,
      plat.x, plat.y, plat.width, plat.height
    )) continue;

    const overlapTop = (player.y + player.height) - plat.y;
    const overlapBottom = (plat.y + plat.height) - player.y;
    const overlapLeft = (player.x + player.width) - plat.x;
    const overlapRight = (plat.x + plat.width) - player.x;

    // Only intervene if deeply embedded (normal collision handles shallow overlap)
    const minOverlap = Math.min(overlapTop, overlapBottom, overlapLeft, overlapRight);
    if (minOverlap <= 5) continue;

    // Eject via smallest overlap direction (only once per frame — break after first ejection
    // to avoid bouncing between adjacent platforms)
    if (minOverlap === overlapTop) {
      player.y = plat.y - player.height;
      player.vy = 0;
    } else if (minOverlap === overlapBottom) {
      player.y = plat.y + plat.height;
      player.vy = 0;
    } else if (minOverlap === overlapLeft) {
      player.x = plat.x - player.width;
      player.vx = 0;
    } else {
      player.x = plat.x + plat.width;
      player.vx = 0;
    }
    return; // one ejection per frame max
  }
}
