import type { Player, MatchState, Arena, EffectZone } from '../types';
import { isBotSlot } from '../types';
import type { AwarenessSnapshot } from './types';
import { PLAYER_WIDTH, PLAYER_HEIGHT, CANVAS_WIDTH } from '../constants';

/** Shortest horizontal distance accounting for screen wrap */
function wrapDx(dx: number): number {
  if (dx > CANVAS_WIDTH / 2) return dx - CANVAS_WIDTH;
  if (dx < -CANVAS_WIDTH / 2) return dx + CANVAS_WIDTH;
  return dx;
}

function wrapDist(ax: number, ay: number, bx: number, by: number): { dx: number; dy: number; dist: number } {
  const dx = wrapDx(bx - ax);
  const dy = by - ay;
  return { dx, dy, dist: Math.sqrt(dx * dx + dy * dy) };
}

export function buildAwareness(
  self: Player,
  state: MatchState,
  arena: Arena,
  awarenessRadius: number,
): AwarenessSnapshot {
  const enemies = state.players.filter(
    p => p.id !== self.id && p.active && p.state !== 'splat' && p.state !== 'respawning',
  );
  const selfOnGround = self.state !== 'airborne';
  const selfAirborne = self.state === 'airborne';

  // Find nearest enemy within awareness radius (wrap-aware)
  let nearestEnemy: AwarenessSnapshot['nearestEnemy'] = null;
  let nearestDist = Infinity;
  for (const e of enemies) {
    const { dx, dy, dist } = wrapDist(self.x, self.y, e.x, e.y);
    if (dist < awarenessRadius && dist < nearestDist) {
      nearestDist = dist;
      nearestEnemy = { x: e.x, y: e.y, vx: e.vx, vy: e.vy, dx, dy, dist, score: e.score };
    }
  }

  // Find stomp target: enemy below and roughly horizontally aligned
  let stompTarget: AwarenessSnapshot['stompTarget'] = null;
  let bestStompDist = Infinity;
  for (const e of enemies) {
    const { dx, dy, dist } = wrapDist(self.x, self.y, e.x, e.y);
    if (dy > 0 && dy < 200 && Math.abs(dx) < 80) {
      if (dist < awarenessRadius && dist < bestStompDist) {
        bestStompDist = dist;
        stompTarget = { x: e.x, y: e.y, dx, dist };
      }
    }
  }

  // Find stomp threat: enemy above falling toward us
  let stompThreat: AwarenessSnapshot['stompThreat'] = null;
  let closestThreatDist = Infinity;
  for (const e of enemies) {
    const { dx, dy, dist } = wrapDist(self.x, self.y, e.x, e.y);
    if (dy < 0 && dy > -200 && Math.abs(dx) < 60 && e.vy > 0) {
      if (dist < awarenessRadius && dist < closestThreatDist) {
        closestThreatDist = dist;
        stompThreat = { x: e.x, y: e.y, dist };
      }
    }
  }

  // Airborne enemies above — broader than stompThreat (includes non-falling)
  const airborneAbove: AwarenessSnapshot['airborneAbove'] = [];
  for (const e of enemies) {
    if (e.state !== 'airborne') continue;
    const { dx, dy, dist } = wrapDist(self.x, self.y, e.x, e.y);
    if (dy < 0 && dy > -250 && Math.abs(dx) < 100 && dist < 300) {
      airborneAbove.push({ x: e.x, dx, dy, dist });
    }
  }

  // Find nearest carrot (wrap-aware)
  let nearestCarrot: AwarenessSnapshot['nearestCarrot'] = null;
  let bestCarrotDist = Infinity;
  for (const c of state.carrots) {
    if (!c.active) continue;
    const { dist } = wrapDist(self.x, self.y, c.x, c.y);
    if (dist < awarenessRadius && dist < bestCarrotDist) {
      bestCarrotDist = dist;
      nearestCarrot = { x: c.x, y: c.y, dist };
    }
  }

  // Find all nearby hazards (hazard zones, thorns, ghosts, lava rocks)
  const nearbyHazards: AwarenessSnapshot['nearbyHazards'] = [];
  let nearestHazard: AwarenessSnapshot['nearestHazard'] = null;
  let bestHazardDist = Infinity;
  const HAZARD_DETECT_RADIUS = 200;
  const hazardRadius = Math.max(awarenessRadius, HAZARD_DETECT_RADIUS);
  const checkHazard = (type: string, hx: number, hy: number) => {
    const dx = hx - self.x;
    const dy = hy - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < hazardRadius) {
      nearbyHazards.push({ type, x: hx, y: hy, dist });
      if (dist < bestHazardDist) {
        bestHazardDist = dist;
        nearestHazard = { type, x: hx, y: hy, dist };
      }
    }
  };

  for (const hz of arena.hazardZones ?? []) {
    checkHazard('lava', hz.x + hz.width / 2, hz.y + hz.height / 2);
  }
  for (const t of state.thorns) {
    if (t.growTimer <= 0 && !t.hit) checkHazard('thorn', t.x, t.y);
  }
  for (const g of state.ghosts) {
    checkHazard('ghost', g.x, g.y);
  }
  for (const r of state.lavaRocks) {
    if (r.active) checkHazard('lavaRock', r.x, r.y);
  }

  // Find nearest platform above and below (wider horizontal range for zigzag stairs)
  let nearestPlatformAbove: AwarenessSnapshot['nearestPlatformAbove'] = null;
  let nearestPlatformBelow: AwarenessSnapshot['nearestPlatformBelow'] = null;
  let bestAboveDy = Infinity;
  let bestBelowDy = Infinity;
  for (const plat of arena.platforms) {
    // 160px horizontal reach — wide enough for zigzag staircases
    if (self.x + PLAYER_WIDTH < plat.x - 160 || self.x > plat.x + plat.width + 160) continue;
    const platTop = plat.y;
    const dy = platTop - (self.y + PLAYER_HEIGHT);
    if (dy < -20 && -dy < bestAboveDy) {
      bestAboveDy = -dy;
      nearestPlatformAbove = { x: plat.x, y: plat.y, width: plat.width, dy };
    }
    if (dy > 10 && dy < bestBelowDy) {
      bestBelowDy = dy;
      nearestPlatformBelow = { x: plat.x, y: plat.y, width: plat.width, dy };
    }
  }

  // Landing platform: when airborne, find the best platform to land on
  let landingPlatform: AwarenessSnapshot['landingPlatform'] = null;
  if (selfAirborne && self.vy >= 0) {
    let bestLandDist = Infinity;
    for (const plat of arena.platforms) {
      const platTop = plat.y;
      const dy = platTop - (self.y + PLAYER_HEIGHT);
      if (dy < 5 || dy > 300) continue; // must be below us, within range
      const centerX = plat.x + plat.width / 2;
      const centerDx = wrapDx(centerX - (self.x + PLAYER_WIDTH / 2));
      // Can we reach this platform horizontally? rough estimate
      if (Math.abs(centerDx) > plat.width / 2 + 150) continue;
      const dist = Math.sqrt(centerDx * centerDx + dy * dy);
      if (dist < bestLandDist) {
        bestLandDist = dist;
        landingPlatform = { x: plat.x, y: plat.y, width: plat.width, centerDx };
      }
    }
  }

  // Check if near edge (allowFallOff arenas)
  let nearEdge = false;
  if (arena.allowFallOff) {
    let hasGroundBelow = false;
    for (const plat of arena.platforms) {
      if (self.x + PLAYER_WIDTH > plat.x && self.x < plat.x + plat.width) {
        const dy = plat.y - (self.y + PLAYER_HEIGHT);
        if (dy >= -5 && dy < 100) { hasGroundBelow = true; break; }
      }
    }
    if (!hasGroundBelow && selfOnGround) nearEdge = true;
    for (const plat of arena.platforms) {
      if (self.y + PLAYER_HEIGHT >= plat.y - 5 && self.y + PLAYER_HEIGHT <= plat.y + 10) {
        if (self.x < plat.x + 20 || self.x + PLAYER_WIDTH > plat.x + plat.width - 20) {
          nearEdge = true;
        }
      }
    }
  }

  // Wind
  const windDir = state.wind.direction;
  const windStrength = state.wind.strength;

  // Effect zones
  let inZeroG = false;
  let inCurrent = 0;
  let nearGeyser: AwarenessSnapshot['nearGeyser'] = null;
  for (const zone of arena.effectZones ?? []) {
    const inZone = self.x + PLAYER_WIDTH > zone.x && self.x < zone.x + zone.width &&
                   self.y + PLAYER_HEIGHT > zone.y && self.y < zone.y + zone.height;
    if (zone.type === 'zero_g' && inZone) inZeroG = true;
    if (zone.type === 'current' && inZone) inCurrent = zone.vx ?? 0;
    if (zone.type === 'geyser') {
      const geyserCx = zone.x + zone.width / 2;
      const dx = geyserCx - (self.x + PLAYER_WIDTH / 2);
      const dy = zone.y - (self.y + PLAYER_HEIGHT);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        const gIdx = findGeyserIndex(zone, arena);
        const gs = gIdx >= 0 && gIdx < state.geyserStates.length ? state.geyserStates[gIdx] : null;
        nearGeyser = {
          x: geyserCx, y: zone.y,
          active: gs?.active ?? false,
          timer: gs?.timer ?? 99,
        };
      }
    }
  }

  // Geyser escape: if inside an active geyser zone, compute escape direction
  let geyserEscapeDx = 0;
  for (const zone of arena.effectZones ?? []) {
    if (zone.type !== 'geyser') continue;
    const inZone = self.x + PLAYER_WIDTH > zone.x && self.x < zone.x + zone.width &&
                   self.y + PLAYER_HEIGHT > zone.y && self.y < zone.y + zone.height;
    if (inZone) {
      const selfCx = self.x + PLAYER_WIDTH / 2;
      const distToLeft = selfCx - zone.x;
      const distToRight = zone.x + zone.width - selfCx;
      // Go toward the nearer edge
      geyserEscapeDx = distToLeft < distToRight ? -(distToLeft + 30) : (distToRight + 30);
      break;
    }
  }

  // Roam target (wrap-aware): nearest carrot, then nearest enemy across full map
  let roamTarget: AwarenessSnapshot['roamTarget'] = null;
  if (nearestCarrot) {
    const dx = wrapDx(nearestCarrot.x - self.x);
    roamTarget = { x: nearestCarrot.x, y: nearestCarrot.y, dx };
  }
  if (!roamTarget) {
    let bestDist = Infinity;
    for (const e of enemies) {
      const { dx, dist } = wrapDist(self.x, self.y, e.x, e.y);
      if (dist < bestDist) {
        bestDist = dist;
        roamTarget = { x: e.x, y: e.y, dx };
      }
    }
  }

  // Nearby bot count (clustering detection)
  let nearbyBotCount = 0;
  for (const p of state.players) {
    if (p.id === self.id || !p.active || !isBotSlot(p.id)) continue;
    const { dist } = wrapDist(self.x, self.y, p.x, p.y);
    if (dist < 120) nearbyBotCount++;
  }

  // Leader score
  let leaderScore = 0;
  for (const p of state.players) {
    if (p.active && p.score > leaderScore) leaderScore = p.score;
  }

  // Elevated platform check (above ground level y=650)
  let onElevatedPlatform = false;
  if (selfOnGround && self.y + PLAYER_HEIGHT < 640) {
    onElevatedPlatform = true;
  }

  return {
    self: {
      x: self.x, y: self.y, vx: self.vx, vy: self.vy,
      onGround: selfOnGround, score: self.score,
      slowed: self.slowTimer > 0, fat: self.fatTimer > 0,
      invincible: self.invincibleTimer > 0, isAirborne: selfAirborne,
    },
    nearestEnemy, roamTarget, stompTarget, stompThreat, airborneAbove, nearestCarrot,
    nearestHazard, nearbyHazards, nearestPlatformAbove, nearestPlatformBelow,
    landingPlatform, nearEdge,
    windDir, windStrength, inZeroG, inCurrent, nearGeyser, geyserEscapeDx,
    nearbyBotCount, leaderScore, onElevatedPlatform,
  };
}

function findGeyserIndex(zone: EffectZone, arena: Arena): number {
  const geysers = (arena.effectZones ?? []).filter(z => z.type === 'geyser');
  return geysers.indexOf(zone);
}
