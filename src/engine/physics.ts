import type { Player, Platform, Arena } from './types';
import {
  GRAVITY, MAX_WALK_SPEED, ACCELERATION, FRICTION,
  JUMP_IMPULSE, MAX_FALL_SPEED, FAST_FALL_GRAVITY, FAST_FALL_SPEED,
  FAST_FALL_INITIAL, PLAYER_PUSH_FORCE,
  FAT_SPEED_MULT, FAT_JUMP_MULT, THORN_SPEED_MULT, THORN_JUMP_MULT,
} from './constants';
import type { InputState } from './types';
import type { SeededRNG } from './net/prng';
import { respawnPlayer } from './stomp';

/** Force 32-bit float for cross-architecture determinism (x86 80-bit vs ARM 64-bit). */
const f = Math.fround;

/** Allow falling past the bottom of the arena before the failsafe fires. Lets fall-off
 *  arenas play their respawn animation; only catastrophically lost players get rescued. */
const OOB_Y_RESCUE_BUFFER = 200;

// ---------------------------------------------------------------------------
// Generic physics primitives (no Math.fround)
// Used by non-deterministic contexts like the lobby. Match physics functions
// (applyGravity, movePlayer) use fround for network determinism — don't replace.
// ---------------------------------------------------------------------------

/** Minimal physics entity — shared between match Player and lobby entities. */
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
  // Center-based: keeps the player half-visible at the seam. An edge-based wrap
  // strands them off-screen if vx decays to 0 before they walk a body-width back.
  const halfW = player.width / 2;
  let center = player.x + halfW;
  if (center < 0 || center >= arenaWidth) {
    center = ((center % arenaWidth) + arenaWidth) % arenaWidth;
    player.x = f(center - halfW);
  }
}

export function collidePlatforms(player: Player, platforms: Platform[]): void {
  if (player.state === 'splat' || player.state === 'respawning') return;

  for (const plat of platforms) {
    // AABB uses the FULL rect so the top "shelf" stays solid even when the
    // collision insets (leftCollisionInset, bottomCollisionInset) are set.
    // Otherwise a player standing on top of an iso platform near the left
    // edge would fall through the inset gap, re-enter AABB next frame, and
    // snap back up — visible as twitching.
    if (aabbOverlap(
      player.x, player.y, player.width, player.height,
      plat.x, plat.y, plat.width, plat.height
    )) {
      // Determine collision direction via index-based min selection.
      // NEVER use float === float (Math.min can return 1-ULP different value).
      const overlapLeft = f(f(player.x + player.width) - plat.x);
      const overlapRight = f(f(plat.x + plat.width) - player.x);
      const overlapTop = f(f(player.y + player.height) - plat.y);
      const overlapBottom = f(f(plat.y + plat.height) - player.y);

      // Index-based min: 0=left, 1=right, 2=top, 3=bottom
      let minDir = 0;
      let minVal = overlapLeft;
      if (overlapRight < minVal) { minVal = overlapRight; minDir = 1; }
      if (overlapTop < minVal) { minVal = overlapTop; minDir = 2; }
      if (overlapBottom < minVal) { minVal = overlapBottom; minDir = 3; }

      // Prefer top landing when player feet are near platform top
      // and horizontal penetration exceeds vertical (came from above)
      const feetNearTop = overlapTop < f(player.height * 0.5);
      const sideOverlap = overlapLeft < overlapRight ? overlapLeft : overlapRight;
      const landingFromAbove = feetNearTop && sideOverlap > overlapTop;

      // Phantom-strip gates: skip lateral / head-bump response while the
      // player is inside the visual cap overhang, so a player can pass "behind"
      // the iso skew (jump from below, walk into from the left). Computed once
      // here; pastBumpTop also gates the top eject in the fallback to prevent
      // teleporting onto the platform when rising through the bottom strip.
      const li = plat.leftCollisionInset ?? 0;
      const bonkLeftX = f(plat.x + li);
      const pastBonkWall = f(player.x + player.width) > bonkLeftX;
      const bi = plat.bottomCollisionInset ?? 0;
      const bonkTopY = f(plat.y + plat.height - bi);
      const pastBumpTop = player.y < bonkTopY;

      if ((minDir === 2 || landingFromAbove) && player.vy >= 0 && overlapTop < overlapBottom) {
        // Landing on top — cap is the shelf, full rect, no gate.
        player.y = plat.y - player.height;
        player.vy = 0;
        if (player.state === 'airborne') {
          player.state = player.vx !== 0 ? 'run' : 'idle';
        }
        player.fastFalling = false;
      } else if (minDir === 3 && player.vy < 0) {
        if (pastBonkWall && pastBumpTop) {
          player.y = bonkTopY;
          player.vy = 0;
        }
      } else if (minDir === 0) {
        // Side bonk left — clamped to the inset wall, not raw plat.x.
        if (pastBonkWall) {
          player.x = bonkLeftX - player.width;
          if (player.vx > 0) { player.sideSquash = 0.75; player.vx = 0; }
        }
      } else if (minDir === 1) {
        player.x = plat.x + plat.width;
        if (player.vx < 0) { player.sideSquash = 0.75; player.vx = 0; }
      } else {
        // Fallback for tied/sign-conflicting cases: minDir===2 with overlapTop===overlapBottom
        // (top branch's strict-less-than fails) and minDir===3 with vy>=0 (head bump's vy<0 fails).
        // Skip while rising — minDir flips to 2 on descent and the top branch handles it.
        if (pastBonkWall && pastBumpTop && player.vy >= 0) {
          if (overlapTop <= overlapBottom) {
            player.y = plat.y - player.height;
            player.vy = 0;
          } else {
            player.y = bonkTopY;
            player.vy = 0;
          }
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
  return ax < f(bx + bw) && f(ax + aw) > bx && ay < f(by + bh) && f(ay + ah) > by;
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

      // Skip if one is above the other (stomp zone) — fround intermediates
      const vertOverlap = f(f(Math.min(f(a.y + a.height), f(b.y + b.height))) - f(Math.max(a.y, b.y)));
      if (vertOverlap < f(a.height * 0.5)) continue;

      // Check overlap using inset boxes
      const aLeft = f(a.x + margin);
      const aRight = f(f(a.x + a.width) - margin);
      const bLeft = f(b.x + margin);
      const bRight = f(f(b.x + b.width) - margin);

      if (aRight > bLeft && aLeft < bRight) {
        // Overlapping — hard separate
        const aCx = f(a.x + f(a.width / 2));
        const bCx = f(b.x + f(b.width / 2));
        const halfW = f(f(f(a.width - margin * 2) / 2) + f(f(b.width - margin * 2) / 2));
        const dist = f(Math.abs(f(aCx - bCx)));
        const overlap = f(halfW - dist);

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

    const overlapTop = f(f(player.y + player.height) - plat.y);
    const overlapBottom = f(f(plat.y + plat.height) - player.y);
    const overlapLeft = f(f(player.x + player.width) - plat.x);
    const overlapRight = f(f(plat.x + plat.width) - player.x);

    // Index-based min: 0=top, 1=bottom, 2=left, 3=right
    let minDir = 0;
    let minVal = overlapTop;
    if (overlapBottom < minVal) { minVal = overlapBottom; minDir = 1; }
    if (overlapLeft < minVal) { minVal = overlapLeft; minDir = 2; }
    if (overlapRight < minVal) { minVal = overlapRight; minDir = 3; }

    // Phantom-strip allowances (wider than the universal 5px shallow guard).
    // collidePlatforms lets players legitimately embed up to the inset there;
    // ejecting every frame would undo the pass-through.
    const bi = plat.bottomCollisionInset ?? 0;
    const li = plat.leftCollisionInset ?? 0;
    if (minDir === 1 && overlapBottom <= bi + 5) continue;
    if (minDir === 2 && overlapLeft <= li + 5) continue;
    // Universal: only intervene on deep embed.
    if (minVal <= 5) continue;
    // Rising-player guard: minDir flips to 0 (top) as they clear the cap from
    // inside the strip — snapping up would teleport them onto the platform.
    if (minDir === 0 && player.vy < 0) continue;

    // Eject via smallest overlap direction (index-based, no float ===)
    if (minDir === 0) {
      player.y = plat.y - player.height;
      player.vy = 0;
    } else if (minDir === 1) {
      player.y = plat.y + plat.height;
      player.vy = 0;
    } else if (minDir === 2) {
      player.x = plat.x - player.width;
      player.vx = 0;
    } else {
      player.x = plat.x + plat.width;
      player.vx = 0;
    }
    return; // one ejection per frame max
  }
}

/**
 * Failsafe: if a player ends up outside the playable area despite wrapHorizontal
 * having run, respawn them. Mirrors resolveStuckPlayer's role for deep-platform
 * embeds — catches the rare case so they can't end up permanently invisible.
 */
export function resolveOutOfBoundsPlayer(
  player: Player,
  arena: Arena,
  allPlayers?: Player[],
  rng?: SeededRNG,
): void {
  // Bounds check first — this is the hot path (every active player, every tick).
  const center = player.x + player.width / 2;
  if (center >= 0 && center < arena.width && player.y <= arena.height + OOB_Y_RESCUE_BUFFER) return;
  if (!player.active || player.state === 'splat' || player.state === 'respawning') return;
  respawnPlayer(player, arena.spawnPoints, allPlayers, rng);
}
