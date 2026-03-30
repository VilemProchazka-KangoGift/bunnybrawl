import type { Player, Platform, Arena } from './types';
import {
  GRAVITY, MAX_WALK_SPEED, ACCELERATION, FRICTION,
  JUMP_IMPULSE, MAX_FALL_SPEED,
} from './constants';
import type { InputState } from './types';

export function applyInput(player: Player, input: InputState, dt: number): void {
  if (player.state === 'splat' || player.state === 'respawning') return;

  // Horizontal movement
  if (input.left) {
    player.vx -= ACCELERATION * dt;
    player.facing = 'left';
  } else if (input.right) {
    player.vx += ACCELERATION * dt;
    player.facing = 'right';
  } else {
    // Apply friction
    if (player.vx > 0) {
      player.vx = Math.max(0, player.vx - FRICTION * dt);
    } else if (player.vx < 0) {
      player.vx = Math.min(0, player.vx + FRICTION * dt);
    }
  }

  // Clamp horizontal speed
  player.vx = Math.max(-MAX_WALK_SPEED, Math.min(MAX_WALK_SPEED, player.vx));

  // Jump (only if on ground)
  if (input.jump && player.state !== 'airborne') {
    player.vy = JUMP_IMPULSE;
    player.state = 'airborne';
  }
}

export function applyGravity(player: Player, dt: number): void {
  if (player.state === 'splat' || player.state === 'respawning') return;
  player.vy += GRAVITY * dt;
  player.vy = Math.min(player.vy, MAX_FALL_SPEED);
}

export function movePlayer(player: Player, dt: number): void {
  if (player.state === 'splat' || player.state === 'respawning') return;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
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

      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

      if (minOverlap === overlapTop && player.vy >= 0) {
        // Landing on top
        player.y = plat.y - player.height;
        player.vy = 0;
        if (player.state === 'airborne') {
          player.state = player.vx !== 0 ? 'run' : 'idle';
        }
      } else if (minOverlap === overlapBottom && player.vy < 0) {
        // Hitting bottom (head bump) — just stop upward motion
        player.y = plat.y + plat.height;
        player.vy = 0;
      } else if (minOverlap === overlapLeft) {
        player.x = plat.x - player.width;
        player.vx = 0;
      } else if (minOverlap === overlapRight) {
        player.x = plat.x + plat.width;
        player.vx = 0;
      }
    }
  }
}

export function updatePlayerState(player: Player): void {
  if (player.state === 'splat' || player.state === 'respawning') return;

  // Check if airborne (not standing on anything — vy > small threshold)
  if (player.vy !== 0) {
    player.state = 'airborne';
  } else if (Math.abs(player.vx) > 10) {
    player.state = 'run';
  } else {
    player.state = 'idle';
  }
}

export function checkOnGround(player: Player, platforms: Platform[]): boolean {
  // Check if there's a platform directly below (within 2px)
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

export function applyArenaConstraints(player: Player, arena: Arena): void {
  // Keep player within vertical bounds
  if (player.y < 0) {
    player.y = 0;
    player.vy = Math.max(player.vy, 0); // Cap upward velocity
  }
  if (player.y + player.height > arena.height) {
    player.y = arena.height - player.height;
    player.vy = 0;
    if (player.state === 'airborne') {
      player.state = player.vx !== 0 ? 'run' : 'idle';
    }
  }

  // Horizontal wrapping
  wrapHorizontal(player, arena.width);
}
