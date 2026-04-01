import type { Platform, EffectZone } from '../types';
import { JUMP_IMPULSE, GRAVITY, MAX_WALK_SPEED, PLAYER_WIDTH, CANVAS_WIDTH } from '../constants';

// Max jump height: v²/(2g) = 560²/1800 ≈ 174px
const MAX_JUMP_HEIGHT = (JUMP_IMPULSE * JUMP_IMPULSE) / (2 * GRAVITY);

export interface ReachResult {
  reachable: boolean;
  approachX: number; // x position to stand at before jumping/dropping
}

/**
 * Can a player standing on `from` jump to land on `to`?
 * Returns the ideal x to stand at on `from` before jumping.
 */
export function canJumpTo(from: Platform, to: Platform): ReachResult {
  // Player stands on from: feet at from.y, head at from.y - PLAYER_HEIGHT
  // Needs to reach to.y (top of target platform) with feet
  // Rise needed = from.y - to.y (positive means 'to' is above)
  const riseNeeded = from.y - to.y;
  if (riseNeeded < -10) {
    // Target is below — not a jump target (use drop)
    return { reachable: false, approachX: 0 };
  }
  if (riseNeeded > MAX_JUMP_HEIGHT) {
    // Too high to reach
    return { reachable: false, approachX: 0 };
  }

  // Time to reach target height during jump arc
  // y(t) = v0*t + 0.5*g*t² where v0 = JUMP_IMPULSE (negative), g = GRAVITY (positive)
  // Solve: riseNeeded = -JUMP_IMPULSE*t - 0.5*GRAVITY*t² (in upward terms)
  // Player rises by riseNeeded pixels. Time on ascending side:
  // Using quadratic: 0.5*GRAVITY*t² + JUMP_IMPULSE*t + riseNeeded = 0
  // For the horizontal window, we use the full air time at that height (both up and down passes)
  const discriminant = JUMP_IMPULSE * JUMP_IMPULSE - 2 * GRAVITY * riseNeeded;
  if (discriminant < 0) return { reachable: false, approachX: 0 };

  // Time when player returns to target height (descending)
  const tDescend = (-JUMP_IMPULSE + Math.sqrt(discriminant)) / GRAVITY;
  // Horizontal window: player can travel during [0, tDescend]
  const maxHDist = MAX_WALK_SPEED * tDescend;

  // Check if any position on `from` can reach any position on `to`
  // Consider both direct and wrapped paths
  const fromLeft = from.x;
  const fromRight = from.x + from.width;
  const toLeft = to.x;
  const toRight = to.x + to.width;

  // Try direct path
  const directResult = checkHorizontalReach(fromLeft, fromRight, toLeft, toRight, maxHDist, 0);
  if (directResult.reachable) return directResult;

  // Try wrap-left path (from wraps left to reach to)
  const wrapLeftResult = checkHorizontalReach(fromLeft, fromRight, toLeft, toRight, maxHDist, -CANVAS_WIDTH);
  if (wrapLeftResult.reachable) return wrapLeftResult;

  // Try wrap-right path
  const wrapRightResult = checkHorizontalReach(fromLeft, fromRight, toLeft, toRight, maxHDist, CANVAS_WIDTH);
  if (wrapRightResult.reachable) return wrapRightResult;

  return { reachable: false, approachX: 0 };
}

function checkHorizontalReach(
  fromLeft: number, fromRight: number,
  toLeft: number, toRight: number,
  maxHDist: number, wrapOffset: number,
): ReachResult {
  const tl = toLeft + wrapOffset;
  const tr = toRight + wrapOffset;

  // Best approach: stand as close to target as possible
  // The player center needs to land within [toLeft, toRight] (accounting for PLAYER_WIDTH)
  const targetCenterLeft = tl + PLAYER_WIDTH / 2;
  const targetCenterRight = tr - PLAYER_WIDTH / 2;
  const fromCenterLeft = fromLeft + PLAYER_WIDTH / 2;
  const fromCenterRight = fromRight - PLAYER_WIDTH / 2;

  // Minimum horizontal distance from any point on `from` to any point on `to`
  let minDist: number;
  let approachX: number;

  if (fromCenterRight < targetCenterLeft) {
    // from is entirely left of to
    minDist = targetCenterLeft - fromCenterRight;
    approachX = fromRight - PLAYER_WIDTH; // stand at right edge of from
  } else if (fromCenterLeft > targetCenterRight) {
    // from is entirely right of to
    minDist = fromCenterLeft - targetCenterRight;
    approachX = fromLeft; // stand at left edge of from
  } else {
    // Overlapping horizontally — jump straight up
    minDist = 0;
    const overlapLeft = Math.max(fromLeft, tl);
    const overlapRight = Math.min(fromRight, tr);
    approachX = (overlapLeft + overlapRight) / 2 - PLAYER_WIDTH / 2;
  }

  if (minDist <= maxHDist) {
    // Clamp approachX to from platform bounds
    approachX = Math.max(fromLeft, Math.min(approachX, fromRight - PLAYER_WIDTH));
    // Unwrap approachX if needed
    if (approachX < 0) approachX += CANVAS_WIDTH;
    if (approachX >= CANVAS_WIDTH) approachX -= CANVAS_WIDTH;
    return { reachable: true, approachX };
  }

  return { reachable: false, approachX: 0 };
}

/**
 * Can a player walk off `from` and drop onto `to`?
 */
export function canDropTo(from: Platform, to: Platform): ReachResult {
  // Target must be below
  const drop = to.y - from.y;
  if (drop < 10) return { reachable: false, approachX: 0 }; // not below enough

  // Fall time: d = 0.5*g*t² → t = sqrt(2d/g)
  const fallTime = Math.sqrt((2 * drop) / GRAVITY);
  // Horizontal drift during fall
  const maxHDrift = MAX_WALK_SPEED * fallTime;

  const fromLeft = from.x;
  const fromRight = from.x + from.width;
  const toLeft = to.x;
  const toRight = to.x + to.width;

  // Check direct
  const directResult = checkDropReach(fromLeft, fromRight, toLeft, toRight, maxHDrift, 0);
  if (directResult.reachable) return directResult;

  // Check wrap
  const wrapLeftResult = checkDropReach(fromLeft, fromRight, toLeft, toRight, maxHDrift, -CANVAS_WIDTH);
  if (wrapLeftResult.reachable) return wrapLeftResult;

  const wrapRightResult = checkDropReach(fromLeft, fromRight, toLeft, toRight, maxHDrift, CANVAS_WIDTH);
  if (wrapRightResult.reachable) return wrapRightResult;

  return { reachable: false, approachX: 0 };
}

function checkDropReach(
  fromLeft: number, fromRight: number,
  toLeft: number, toRight: number,
  maxHDrift: number, wrapOffset: number,
): ReachResult {
  const tl = toLeft + wrapOffset;
  const tr = toRight + wrapOffset;

  // Walk off the edge of from closest to to
  const fromCenter = (fromLeft + fromRight) / 2;
  const toCenter = (tl + tr) / 2;

  let approachX: number;
  let minDist: number;

  if (toCenter < fromCenter) {
    // Target is left — walk off left edge
    approachX = fromLeft;
    minDist = Math.max(0, tl - fromLeft, fromLeft - tr);
    if (fromLeft >= tl && fromLeft <= tr) minDist = 0;
  } else {
    // Target is right — walk off right edge
    approachX = fromRight - PLAYER_WIDTH;
    const rightEdge = fromRight;
    minDist = Math.max(0, tl - rightEdge, rightEdge - tr);
    if (rightEdge >= tl && rightEdge <= tr) minDist = 0;
  }

  if (minDist <= maxHDrift) {
    approachX = Math.max(fromLeft, Math.min(approachX, fromRight - PLAYER_WIDTH));
    if (approachX < 0) approachX += CANVAS_WIDTH;
    if (approachX >= CANVAS_WIDTH) approachX -= CANVAS_WIDTH;
    return { reachable: true, approachX };
  }

  return { reachable: false, approachX: 0 };
}

/**
 * Can a player walk directly from `from` to `to`?
 * Platforms must be at similar height and horizontally adjacent/overlapping.
 */
export function canWalkTo(from: Platform, to: Platform): boolean {
  // Same height (within tolerance)
  if (Math.abs(from.y - to.y) > 8) return false;
  // Horizontally adjacent or overlapping (with small gap tolerance for player width)
  const gap = Math.max(0, to.x - (from.x + from.width), from.x - (to.x + to.width));
  return gap <= PLAYER_WIDTH;
}

/**
 * Can a player ride a geyser from `from` up to `to`?
 *
 * Continuous geysers (like underwater bubble column) carry the player through the
 * entire zone height — the player can reach any platform whose Y is within the zone.
 * Once outside the zone horizontally, the player drifts under gravity.
 */
export function canGeyserTo(from: Platform, geyser: EffectZone, to: Platform): ReachResult {
  // Target must be above
  if (to.y >= from.y) return { reachable: false, approachX: 0 };

  // Target must be within geyser zone's vertical extent (zone lifts through this range)
  if (to.y < geyser.y - 50) return { reachable: false, approachX: 0 }; // above zone + some drift margin

  const geyserLeft = geyser.x;
  const geyserRight = geyser.x + geyser.width;

  // Player must be able to enter the geyser from `from` platform
  // Either `from` overlaps the geyser, or `from` is close enough to walk into it
  const fromLeft = from.x;
  const fromRight = from.x + from.width;
  const entryLeft = Math.max(fromLeft, geyserLeft);
  const entryRight = Math.min(fromRight, geyserRight);
  const directOverlap = entryRight - entryLeft >= PLAYER_WIDTH;

  // If no direct overlap, check if from platform edge is close enough to walk into geyser
  if (!directOverlap) {
    const gapToGeyser = Math.max(0, geyserLeft - fromRight, fromLeft - geyserRight);
    if (gapToGeyser > PLAYER_WIDTH * 2) return { reachable: false, approachX: 0 };
  }

  // The geyser carries the player up. Once at the target platform's height,
  // the player steers horizontally out of the geyser zone to land on the platform.
  // If target overlaps geyser horizontally → easy, just exit onto it
  const toLeft = to.x;
  const toRight = to.x + to.width;
  const targetOverlapsGeyser = toRight > geyserLeft && toLeft < geyserRight;

  if (targetOverlapsGeyser) {
    // Can land directly by steering within the geyser
    const approachX = directOverlap
      ? Math.max(entryLeft, Math.min((entryLeft + entryRight) / 2 - PLAYER_WIDTH / 2, entryRight - PLAYER_WIDTH))
      : (geyserLeft + geyserRight) / 2 - PLAYER_WIDTH / 2;
    return { reachable: true, approachX: Math.round(Math.max(0, approachX)) };
  }

  // Target is outside geyser horizontally — player must exit the zone edge and drift
  // Drift time: fall from geyser exit to platform height (may be at same height if exiting at target Y)
  // Conservative estimate: player can drift MAX_WALK_SPEED * 1.0s (~280px) after exiting the zone
  const driftBudget = MAX_WALK_SPEED * 1.0;
  const nearestGeyserEdge = Math.abs(toLeft - geyserRight) < Math.abs(toRight - geyserLeft)
    ? geyserRight : geyserLeft;
  const toCenterX = toLeft + to.width / 2;
  const driftNeeded = Math.abs(toCenterX - nearestGeyserEdge);

  if (driftNeeded <= driftBudget + to.width / 2) {
    // Approach: stand at the geyser edge closest to the target
    const approachX = nearestGeyserEdge === geyserRight
      ? geyserRight - PLAYER_WIDTH
      : geyserLeft;
    return { reachable: true, approachX: Math.round(Math.max(0, approachX)) };
  }

  return { reachable: false, approachX: 0 };
}

/**
 * Can a player jump into a zero-G zone from `from` and drift across to land on `to`?
 * Zero-G amplifies jumps (vy *= 1.03 each frame, falls slowed by vy *= 0.92).
 * In practice, players float much further horizontally and vertically.
 */
export function canZeroGTo(from: Platform, zone: EffectZone, to: Platform): ReachResult {
  // Both platforms must be at the edges of (or within) the zero-G zone
  const zoneLeft = zone.x;
  const zoneRight = zone.x + zone.width;
  const zoneTop = zone.y;
  const zoneBottom = zone.y + zone.height;

  // The 'from' platform must be near or overlapping the zone edge
  const fromRight = from.x + from.width;
  const fromLeft = from.x;
  const fromNearZone = fromRight >= zoneLeft - 100 && fromLeft <= zoneRight + 100;
  if (!fromNearZone) return { reachable: false, approachX: 0 };

  // Target must be within or near the zone (vertically and horizontally)
  const toRight = to.x + to.width;
  const toLeft = to.x;
  const toNearZone = toRight >= zoneLeft - 100 && toLeft <= zoneRight + 100;
  if (!toNearZone) return { reachable: false, approachX: 0 };

  // Target Y must be within the zone's vertical extent (with margin for drift)
  if (to.y < zoneTop - 100 || to.y > zoneBottom + 50) return { reachable: false, approachX: 0 };
  if (from.y < zoneTop - 50 || from.y > zoneBottom + 50) return { reachable: false, approachX: 0 };

  // In zero-G, effective jump height is much greater (~3-4x normal due to vy amplification)
  // and horizontal drift is much greater (player floats for much longer)
  // Conservative estimate: can cross the full zone width and reach ~400px height
  const maxZeroGHeight = MAX_JUMP_HEIGHT * 3;
  const maxZeroGReach = zone.width + 200; // can drift across the whole zone

  const riseNeeded = from.y - to.y;
  if (riseNeeded > maxZeroGHeight) return { reachable: false, approachX: 0 };

  // Horizontal distance between platforms
  const directDx = Math.abs((from.x + from.width / 2) - (to.x + to.width / 2));
  if (directDx > maxZeroGReach) return { reachable: false, approachX: 0 };

  // Approach position: edge of `from` platform closest to the zone center
  const zoneCx = zoneLeft + zone.width / 2;
  const fromCx = from.x + from.width / 2;
  let approachX: number;
  if (fromCx < zoneCx) {
    approachX = fromRight - PLAYER_WIDTH; // stand at right edge, jump into zone
  } else {
    approachX = fromLeft; // stand at left edge
  }

  return { reachable: true, approachX: Math.round(Math.max(0, approachX)) };
}

/**
 * Compute danger score (0-1) for an edge based on proximity to hazard zones.
 * 0 = no hazards nearby, 1 = passing directly through a hazard.
 * Escape routes (moving AWAY from hazards) get reduced danger so bots don't get stuck in pits.
 */
export function computeEdgeDanger(
  from: Platform, to: Platform, type: 'jump' | 'drop' | 'walk' | 'geyser',
  hazardZones: Array<{ x: number; y: number; width: number; height: number }>,
): number {
  if (hazardZones.length === 0) return 0;

  const DANGER_RADIUS = 80;
  const fromCx = from.x + from.width / 2;
  const fromY = from.y;
  const toCx = to.x + to.width / 2;
  const toY = to.y;

  // Compute danger at destination only (the midpoint of the path, not the source)
  // This way, escaping FROM a dangerous area to a safe area has low danger
  const samplePoints: Array<[number, number]> = [
    [(fromCx + toCx) / 2, Math.min(fromY, toY) - (type === 'jump' || type === 'geyser' ? 60 : 0)],
    [toCx, toY],
  ];

  let maxDanger = 0;
  for (const [sx, sy] of samplePoints) {
    for (const hz of hazardZones) {
      const hzCx = hz.x + hz.width / 2;
      const hzCy = hz.y + hz.height / 2;
      const dx = sx - hzCx;
      const dy = sy - hzCy;
      const distX = Math.max(0, Math.abs(dx) - hz.width / 2);
      const distY = Math.max(0, Math.abs(dy) - hz.height / 2);
      const dist = Math.sqrt(distX * distX + distY * distY);
      if (dist < DANGER_RADIUS) {
        const danger = 1 - dist / DANGER_RADIUS;
        if (danger > maxDanger) maxDanger = danger;
      }
    }
  }

  return maxDanger;
}
