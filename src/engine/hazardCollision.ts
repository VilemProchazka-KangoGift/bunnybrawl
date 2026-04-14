/**
 * Pure collision detection functions for hazard entities.
 * These return collision results only — no side effects (sound, particles, state mutation).
 * The GameLoop calls these and handles all side effects.
 */
import type { Player, SpringMushroom, Thorn, GhostEntity, LavaRock, HazardZone } from './types';
import { aabbOverlap } from './physics';
import { SPRING_SIZE } from './constants';

const f = Math.fround;

/** Result of a spring collision check. */
export interface SpringCollisionResult {
  springIndex: number;
}

/** Result of a thorn collision check. */
export interface ThornCollisionResult {
  thornIndex: number;
}

/** Result of a hazard zone collision check. */
export interface HazardZoneCollisionResult {
  zone: HazardZone;
  /** Horizontal knockback direction: +1 = push right, -1 = push left */
  knockbackDir: number;
}

/** Result of a ghost collision check. */
export interface GhostCollisionResult {
  ghostIndex: number;
  /** Horizontal knockback direction: +1 = push right, -1 = push left */
  knockbackDir: number;
}

/** Result of a lava rock collision check. */
export interface LavaRockCollisionResult {
  rockIndex: number;
  /** Horizontal knockback direction: +1 = push right (rock is to the left), -1 = push left */
  knockbackDir: number;
}

/**
 * Check if a player collides with any spring.
 * Springs must be fully grown (growTimer <= 0) and not already bouncing (bounceTimer <= 0).
 * Player must be moving downward (vy >= 0).
 */
export function checkSpringCollision(
  player: Player,
  springs: SpringMushroom[],
): SpringCollisionResult | null {
  for (let i = 0; i < springs.length; i++) {
    const spring = springs[i];
    if (spring.growTimer > 0 || spring.bounceTimer > 0) continue;
    if (
      player.vy >= 0 &&
      aabbOverlap(
        player.x, player.y, player.width, player.height,
        spring.x - SPRING_SIZE / 2, spring.y - SPRING_SIZE, SPRING_SIZE, SPRING_SIZE,
      )
    ) {
      return { springIndex: i };
    }
  }
  return null;
}

/**
 * Check if a player collides with any thorn.
 * Thorns must be fully grown (growTimer <= 0) and not already hit.
 * Player must not be slowed or invincible.
 */
export function checkThornCollision(
  player: Player,
  thorns: Thorn[],
): ThornCollisionResult | null {
  if (player.slowTimer > 0 || player.invincibleTimer > 0) return null;
  for (let i = 0; i < thorns.length; i++) {
    const thorn = thorns[i];
    if (thorn.growTimer > 0 || thorn.hit) continue;
    if (
      aabbOverlap(
        player.x, player.y, player.width, player.height,
        thorn.x, thorn.y, thorn.width, thorn.height,
      )
    ) {
      return { thornIndex: i };
    }
  }
  return null;
}

/**
 * Check if a player collides with any hazard zone (lava pools, etc.).
 * Uses a 12px horizontal inset to allow edge stepping.
 * Player must not be slowed or invincible.
 */
export function checkHazardZoneCollision(
  player: Player,
  hazardZones: HazardZone[],
): HazardZoneCollisionResult | null {
  if (player.slowTimer > 0 || player.invincibleTimer > 0) return null;
  const inset = 12;
  const pcx = f(player.x + f(player.width / 2));
  for (const hz of hazardZones) {
    if (
      aabbOverlap(
        player.x, player.y, player.width, player.height,
        hz.x + inset, hz.y, hz.width - inset * 2, hz.height,
      )
    ) {
      const hcx = hz.x + hz.width / 2;
      return {
        zone: hz,
        knockbackDir: pcx > hcx ? 1 : -1,
      };
    }
  }
  return null;
}

/**
 * Check if a player collides with any ghost.
 * Uses circle-based distance check (ghost radius + player radius).
 * Player must not be slowed or invincible.
 */
export function checkGhostCollision(
  player: Player,
  ghosts: GhostEntity[],
): GhostCollisionResult | null {
  if (player.slowTimer > 0 || player.invincibleTimer > 0) return null;
  const pcx = f(player.x + f(player.width / 2));
  const pcy = f(player.y + f(player.height / 2));
  for (let i = 0; i < ghosts.length; i++) {
    const ghost = ghosts[i];
    const gx = ghost.x;
    const gy = ghost.y;
    const gr = f(ghost.size * 0.5);
    const dx = f(pcx - gx);
    const dy = f(pcy - gy);
    const hitRadius = f(gr + f(player.width * 0.4));
    if (f(f(dx * dx) + f(dy * dy)) < f(hitRadius * hitRadius)) {
      return {
        ghostIndex: i,
        knockbackDir: dx > 0 ? 1 : -1,
      };
    }
  }
  return null;
}

/**
 * Check if a player collides with any active lava rock.
 * Uses circle-based distance check (rock size + player radius).
 * Player must not be slowed or invincible.
 */
export function checkLavaRockCollision(
  player: Player,
  lavaRocks: LavaRock[],
): LavaRockCollisionResult | null {
  if (player.slowTimer > 0 || player.invincibleTimer > 0) return null;
  const pcx = f(player.x + f(player.width / 2));
  const pcy = f(player.y + f(player.height / 2));
  for (let i = 0; i < lavaRocks.length; i++) {
    const rock = lavaRocks[i];
    if (!rock.active) continue;
    const dx = f(pcx - rock.x);
    const dy = f(pcy - rock.y);
    const hitDist = f(rock.size + f(player.width * 0.3));
    if (f(f(dx * dx) + f(dy * dy)) < f(hitDist * hitDist)) {
      return {
        rockIndex: i,
        knockbackDir: dx > 0 ? 1 : -1,
      };
    }
  }
  return null;
}
