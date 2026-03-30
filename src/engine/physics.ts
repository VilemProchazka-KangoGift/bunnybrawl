import type { Player, Platform, Arena } from './types';
import {
  GRAVITY, MAX_WALK_SPEED, ACCELERATION, FRICTION,
  JUMP_IMPULSE, MAX_FALL_SPEED, FAST_FALL_GRAVITY, FAST_FALL_SPEED,
  FAST_FALL_INITIAL, PLAYER_PUSH_FORCE,
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

  // Fast fall — hold down while airborne: instant direction change
  if (input.down && player.state === 'airborne') {
    if (!player.fastFalling) {
      // First frame of fast-fall: snap velocity downward immediately
      player.vy = Math.max(player.vy, FAST_FALL_INITIAL);
    }
    player.fastFalling = true;
  } else {
    player.fastFalling = false;
  }

  // Jump (only if on ground)
  if (input.jump && player.state !== 'airborne') {
    player.vy = JUMP_IMPULSE;
    player.state = 'airborne';
  }
}

export function applyGravity(player: Player, dt: number): void {
  if (player.state === 'splat' || player.state === 'respawning') return;

  const gravity = player.fastFalling ? FAST_FALL_GRAVITY : GRAVITY;
  const maxFall = player.fastFalling ? FAST_FALL_SPEED : MAX_FALL_SPEED;

  player.vy += gravity * dt;
  player.vy = Math.min(player.vy, maxFall);
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
        player.fastFalling = false;
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
          const half = overlap / 2 + 0.5;
          if (aCx <= bCx) {
            a.x -= half;
            b.x += half;
          } else {
            a.x += half;
            b.x -= half;
          }

          // Velocity exchange: transfer momentum
          const avgVx = (a.vx + b.vx) / 2;
          a.vx = avgVx - PLAYER_PUSH_FORCE * (aCx <= bCx ? 0.3 : -0.3);
          b.vx = avgVx + PLAYER_PUSH_FORCE * (aCx <= bCx ? 0.3 : -0.3);
        }
      }
    }
  }
}

export function applyArenaConstraints(player: Player, arena: Arena): void {
  if (player.y < 0) {
    player.y = 0;
    player.vy = Math.max(player.vy, 0);
  }
  if (player.y + player.height > arena.height) {
    player.y = arena.height - player.height;
    player.vy = 0;
    if (player.state === 'airborne') {
      player.state = player.vx !== 0 ? 'run' : 'idle';
    }
    player.fastFalling = false;
  }

  wrapHorizontal(player, arena.width);
}
