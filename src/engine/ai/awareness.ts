import type { Player, MatchState, Arena, EffectZone } from '../types';
import type { AwarenessSnapshot } from './types';
import { PLAYER_WIDTH, PLAYER_HEIGHT } from '../constants';

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

  // Find nearest enemy within awareness radius
  let nearestEnemy: AwarenessSnapshot['nearestEnemy'] = null;
  let nearestDist = Infinity;
  for (const e of enemies) {
    const dx = e.x - self.x;
    const dy = e.y - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < awarenessRadius && dist < nearestDist) {
      nearestDist = dist;
      nearestEnemy = { x: e.x, y: e.y, vx: e.vx, vy: e.vy, dx, dy, dist, score: e.score };
    }
  }

  // Find stomp target: enemy below and roughly horizontally aligned
  let stompTarget: AwarenessSnapshot['stompTarget'] = null;
  let bestStompDist = Infinity;
  for (const e of enemies) {
    const dx = e.x - self.x;
    const dy = e.y - self.y;
    // Target must be below (dy > 0), roughly aligned horizontally
    if (dy > 0 && dy < 200 && Math.abs(dx) < 80) {
      const dist = Math.sqrt(dx * dx + dy * dy);
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
    const dx = e.x - self.x;
    const dy = e.y - self.y;
    // Threat: above (dy < 0), horizontally close, and falling (vy > 0)
    if (dy < 0 && dy > -200 && Math.abs(dx) < 60 && e.vy > 0) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < awarenessRadius && dist < closestThreatDist) {
        closestThreatDist = dist;
        stompThreat = { x: e.x, y: e.y, dist };
      }
    }
  }

  // Find nearest carrot
  let nearestCarrot: AwarenessSnapshot['nearestCarrot'] = null;
  let bestCarrotDist = Infinity;
  for (const c of state.carrots) {
    if (!c.active) continue;
    const dx = c.x - self.x;
    const dy = c.y - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < awarenessRadius && dist < bestCarrotDist) {
      bestCarrotDist = dist;
      nearestCarrot = { x: c.x, y: c.y, dist };
    }
  }

  // Find nearest hazard (hazard zones, thorns, ghosts, lava rocks)
  let nearestHazard: AwarenessSnapshot['nearestHazard'] = null;
  let bestHazardDist = Infinity;
  const checkHazard = (type: string, hx: number, hy: number) => {
    const dx = hx - self.x;
    const dy = hy - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < awarenessRadius && dist < bestHazardDist) {
      bestHazardDist = dist;
      nearestHazard = { type, x: hx, y: hy, dist };
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

  // Find nearest platform above and below
  let nearestPlatformAbove: AwarenessSnapshot['nearestPlatformAbove'] = null;
  let nearestPlatformBelow: AwarenessSnapshot['nearestPlatformBelow'] = null;
  let bestAboveDy = Infinity;
  let bestBelowDy = Infinity;
  for (const plat of arena.platforms) {
    // Platform must be horizontally reachable
    if (self.x + PLAYER_WIDTH < plat.x - 80 || self.x > plat.x + plat.width + 80) continue;
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

  // Check if near edge (allowFallOff arenas)
  let nearEdge = false;
  if (arena.allowFallOff) {
    // Check if there's ground below the player
    let hasGroundBelow = false;
    for (const plat of arena.platforms) {
      if (self.x + PLAYER_WIDTH > plat.x && self.x < plat.x + plat.width) {
        const dy = plat.y - (self.y + PLAYER_HEIGHT);
        if (dy >= -5 && dy < 100) { hasGroundBelow = true; break; }
      }
    }
    if (!hasGroundBelow && selfOnGround) nearEdge = true;
    // Also near edge if close to platform edges
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

  return {
    self: {
      x: self.x, y: self.y, vx: self.vx, vy: self.vy,
      onGround: selfOnGround, score: self.score,
      slowed: self.slowTimer > 0, fat: self.fatTimer > 0,
    },
    nearestEnemy, stompTarget, stompThreat, nearestCarrot, nearestHazard,
    nearestPlatformAbove, nearestPlatformBelow, nearEdge,
    windDir, windStrength, inZeroG, inCurrent, nearGeyser,
  };
}

function findGeyserIndex(zone: EffectZone, arena: Arena): number {
  const geysers = (arena.effectZones ?? []).filter(z => z.type === 'geyser');
  return geysers.indexOf(zone);
}
