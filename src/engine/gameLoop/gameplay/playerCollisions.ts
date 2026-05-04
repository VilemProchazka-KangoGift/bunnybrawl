/**
 * Hazard collision handlers extracted from GameLoop.fixedUpdate().
 *
 * Each handler detects a collision, applies ALL state changes to the player,
 * and returns a HazardHitResult for the caller to emit VFX (particles, screen
 * effects, haptics). Returns null on no collision.
 */
import type { Player, MatchState, Arena } from '../../types';
import {
  SPRING_BOUNCE, SPRING_TRAIL_DURATION,
  THORN_SLOW_DURATION, HAZARD_HITSTOP_DURATION,
  CANVAS_HEIGHT,
} from '../../constants';
import {
  checkSpringCollision, checkThornCollision, checkHazardZoneCollision,
  checkGhostCollision, checkLavaRockCollision,
} from '../../hazardCollision';
import { respawnPlayer } from '../../stomp';

const f = Math.fround;

/** Describes a hazard collision for VFX emission by the caller. */
export interface HazardHitResult {
  type: 'spring' | 'thorn' | 'hazardZone' | 'ghost' | 'lavaRock' | 'fallOff';
  px: number;  // player center x at collision
  py: number;  // player center y at collision
  sx?: number; // secondary position (thorn shrapnel origin)
  sy?: number;
  hazardType?: string; // for hazardZone particle coloring
  screenShake?: number;
  screenFlash?: number;
  hitstopZoom?: number;
  haptic?: 'hazardHit' | 'spring';
}

/**
 * Spring collision — bounces the player upward.
 * Only fully grown springs (growTimer <= 0), not already bouncing (bounceTimer <= 0).
 */
export function handleSpringCollision(player: Player, state: MatchState): HazardHitResult | null {
  const springHit = checkSpringCollision(player, state.springs);
  if (!springHit) return null;

  const spring = state.springs[springHit.springIndex];
  player.vy = SPRING_BOUNCE;
  player.state = 'airborne';
  spring.bounceTimer = 0.3;
  player.springTrailTimer = SPRING_TRAIL_DURATION;
  // Anchor the trail at the spring (stable across frames). Set here in fixedUpdate
  // so the renderer sees the launch coords on the same tick the timer becomes >0
  // — relying on cosmeticStep (half-rate) to capture player.x/y was racy.
  player.springLaunchX = spring.x;
  player.springLaunchY = spring.y;
  // spring sound moved to cosmeticStep (bounceTimer transition detection)

  return {
    type: 'spring',
    px: player.x + player.width / 2,
    py: player.y + player.height / 2,
    haptic: 'spring',
  };
}

/**
 * Thorn collision — slows the player, marks the thorn as hit.
 * Blood particles + thorn shrapnel emitted at collision point.
 */
export function handleThornCollision(player: Player, state: MatchState): HazardHitResult | null {
  const thornHit = checkThornCollision(player, state.thorns);
  if (!thornHit) return null;

  const thorn = state.thorns[thornHit.thornIndex];
  player.slowTimer = THORN_SLOW_DURATION;
  thorn.hit = true;
  // thornhit sound fired by cosmeticStep via slowTimer transition detection

  player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);

  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  const tx = thorn.x + thorn.width / 2;
  const ty = thorn.y;

  return {
    type: 'thorn',
    px, py,
    sx: tx, sy: ty,
    screenShake: 0.15,
    hitstopZoom: HAZARD_HITSTOP_DURATION,
    haptic: 'hazardHit',
  };
}

/**
 * Hazard zone collision (lava pools etc.) — inset hitbox by 12px on sides.
 * Slows player, applies burn timer for lava, knockback + damage flash.
 */
export function handleHazardZoneCollision(player: Player, arena: Arena): HazardHitResult | null {
  if (!arena.hazardZones) return null;

  const hzHit = checkHazardZoneCollision(player, arena.hazardZones);
  if (!hzHit) return null;

  const hz = hzHit.zone;
  player.slowTimer = THORN_SLOW_DURATION;
  if (hz.type === 'lava') player.burnTimer = THORN_SLOW_DURATION;
  // thornhit sound fired by cosmeticStep via slowTimer transition detection

  // Knockback away from hazard center
  player.vx = f(player.vx + hzHit.knockbackDir * 150);
  player.vy = -200;
  player.damageFlashSide = hzHit.knockbackDir > 0 ? 'left' : 'right';
  player.damageFlashTimer = 0.4;
  player.squashScale = 0.6;
  player.squashTimer = 0.2;
  player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);

  return {
    type: 'hazardZone',
    px: player.x + player.width / 2,
    py: player.y + player.height / 2,
    hazardType: hz.type,
    screenShake: 0.25,
    screenFlash: 0.06,
    hitstopZoom: HAZARD_HITSTOP_DURATION,
    haptic: 'hazardHit',
  };
}

/**
 * Ghost collision — slows the player, knockback + damage flash.
 */
export function handleGhostCollision(player: Player, state: MatchState): HazardHitResult | null {
  const ghostHit = checkGhostCollision(player, state.ghosts);
  if (!ghostHit) return null;

  player.slowTimer = THORN_SLOW_DURATION;
  // thornhit sound fired by cosmeticStep via slowTimer transition detection

  // Knockback away from ghost
  player.vx = f(player.vx + ghostHit.knockbackDir * 180);
  player.vy = -180;
  player.damageFlashSide = ghostHit.knockbackDir > 0 ? 'left' : 'right';
  player.damageFlashTimer = 0.4;
  player.squashScale = 0.6;
  player.squashTimer = 0.2;
  player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);

  return {
    type: 'ghost',
    px: player.x + player.width / 2,
    py: player.y + player.height / 2,
    screenShake: 0.2,
    screenFlash: 0.06,
    hitstopZoom: HAZARD_HITSTOP_DURATION,
  };
}

/**
 * Lava rock collision — deactivates the rock, slows the player, knockback + damage flash.
 */
export function handleLavaRockCollision(player: Player, state: MatchState): HazardHitResult | null {
  const rockHit = checkLavaRockCollision(player, state.lavaRocks);
  if (!rockHit) return null;

  const rock = state.lavaRocks[rockHit.rockIndex];
  rock.active = false;
  player.slowTimer = THORN_SLOW_DURATION;
  // thornhit sound fired by cosmeticStep via slowTimer transition detection

  player.vx = f(player.vx + (rockHit.knockbackDir > 0 ? -120 : 120));
  player.vy = -150;
  player.damageFlashSide = rockHit.knockbackDir > 0 ? 'left' : 'right';
  player.damageFlashTimer = 0.3;
  player.squashScale = 0.65;
  player.squashTimer = 0.2;
  player.hitstopTimer = Math.max(player.hitstopTimer, HAZARD_HITSTOP_DURATION);

  return {
    type: 'lavaRock',
    px: player.x + player.width / 2,
    py: player.y + player.height / 2,
    screenShake: 0.2,
    hitstopZoom: HAZARD_HITSTOP_DURATION,
    haptic: 'hazardHit',
  };
}

/**
 * Fall-off detection — respawns the player when they fall below the arena.
 * Used by arenas with allowFallOff (rooftops, treetops — gaps in ground).
 * No score penalty — just lose ~1 second to respawn in hurt state.
 */
export function handleFallOff(player: Player, arena: Arena, state: MatchState): HazardHitResult | null {
  if (!arena.allowFallOff || player.y <= CANVAS_HEIGHT + 50) return null;

  // Distance-based spawn picker (no RNG call — same as stomp respawn)
  respawnPlayer(player, arena.spawnPoints, state.players);
  player.invincibleTimer = 1.5; // shorter than stomp respawn
  player.slowTimer = 2.0; // respawn slowed (hurt state)
  // oof sound moved to cosmeticStep (burn start transition detection covers this)

  return {
    type: 'fallOff',
    px: player.x + player.width / 2,
    py: player.y + player.height / 2,
    screenShake: 0.1,
  };
}
