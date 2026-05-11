import type { Player, MatchState, Arena } from '../types';
import { isBotSlot } from '../types';
import type { AwarenessSnapshot, HazardType } from './types';
import { PLAYER_WIDTH, PLAYER_HEIGHT, CANVAS_WIDTH } from '../constants';
import { getArenaNav } from '../arenas/registry';
import { perfTrace } from '../perfTrace';

type AirborneAboveEntry = AwarenessSnapshot['airborneAbove'][number];
type NearbyHazardEntry = AwarenessSnapshot['nearbyHazards'][number];

/**
 * Per-AIController scratch struct. Pre-allocated once and reused across every
 * buildAwarenessInto() call so the bot decision frame allocates zero objects
 * in steady state. The snapshot's nullable subfields point at the dedicated
 * single-instance scratches when present, or null when absent. Variable-length
 * arrays (`airborneAbove`, `nearbyHazards`) reuse entries from their pools.
 *
 * Readers must consume the snapshot synchronously — storing a reference to a
 * subfield will see it mutated on the next buildAwareness call. The bot's nav
 * debug visualization (`getLastNavTarget`) is the one cross-frame reader, and
 * it tolerates this because the bot owns its own scratch.
 */
export interface AwarenessScratch {
  readonly snapshot: AwarenessSnapshot;
  readonly _nearestEnemy: NonNullable<AwarenessSnapshot['nearestEnemy']>;
  readonly _priorityTarget: NonNullable<AwarenessSnapshot['priorityTarget']>;
  readonly _roamTarget: NonNullable<AwarenessSnapshot['roamTarget']>;
  readonly _stompTarget: NonNullable<AwarenessSnapshot['stompTarget']>;
  readonly _stompThreat: NonNullable<AwarenessSnapshot['stompThreat']>;
  readonly _nearestCarrot: NonNullable<AwarenessSnapshot['nearestCarrot']>;
  readonly _nearestHazard: NonNullable<AwarenessSnapshot['nearestHazard']>;
  readonly _nearestPlatformAbove: NonNullable<AwarenessSnapshot['nearestPlatformAbove']>;
  readonly _nearestPlatformBelow: NonNullable<AwarenessSnapshot['nearestPlatformBelow']>;
  readonly _landingPlatform: NonNullable<AwarenessSnapshot['landingPlatform']>;
  readonly _nearGeyser: NonNullable<AwarenessSnapshot['nearGeyser']>;
  readonly _navTarget: NonNullable<AwarenessSnapshot['navTarget']>;
  readonly _airborneAbovePool: AirborneAboveEntry[];
  readonly _nearbyHazardsPool: NearbyHazardEntry[];
}

export function createAwarenessScratch(): AwarenessScratch {
  const snapshot: AwarenessSnapshot = {
    self: { x: 0, y: 0, vx: 0, vy: 0, onGround: false, score: 0, slowed: false, fat: false, invincible: false },
    nearestEnemy: null,
    priorityTarget: null,
    roamTarget: null,
    stompTarget: null,
    stompThreat: null,
    airborneAbove: [],
    nearestCarrot: null,
    nearestHazard: null,
    nearbyHazards: [],
    nearestPlatformAbove: null,
    nearestPlatformBelow: null,
    landingPlatform: null,
    nearEdge: false,
    inZeroG: false,
    inCurrent: 0,
    nearGeyser: null,
    geyserEscapeDx: 0,
    nearbyBotCount: 0,
    leaderScore: 0,
    onElevatedPlatform: false,
    currentPlatformIdx: -1,
    navTarget: null,
  };
  return {
    snapshot,
    _nearestEnemy: { x: 0, y: 0, vx: 0, vy: 0, dx: 0, dy: 0, dist: 0, score: 0 },
    _priorityTarget: { x: 0, y: 0, dx: 0, dy: 0, dist: 0, juiciness: 0 },
    _roamTarget: { x: 0, y: 0, dx: 0 },
    _stompTarget: { x: 0, y: 0, dx: 0, dist: 0 },
    _stompThreat: { x: 0, y: 0, dist: 0 },
    _nearestCarrot: { x: 0, y: 0, dist: 0 },
    _nearestHazard: { type: 'lava', x: 0, y: 0, dist: 0 },
    _nearestPlatformAbove: { x: 0, y: 0, width: 0, dy: 0 },
    _nearestPlatformBelow: { x: 0, y: 0, width: 0, dy: 0 },
    _landingPlatform: { x: 0, y: 0, width: 0, centerDx: 0 },
    _nearGeyser: { x: 0, y: 0, active: false, timer: 0 },
    _navTarget: { x: 0, y: 0, width: 0, approachX: 0, type: 'j' },
    _airborneAbovePool: [],
    _nearbyHazardsPool: [],
  };
}

function takeAirborneEntry(scratch: AwarenessScratch): AirborneAboveEntry {
  return scratch._airborneAbovePool.pop() ?? { x: 0, dx: 0, dy: 0, dist: 0 };
}

function takeHazardEntry(scratch: AwarenessScratch, type: HazardType): NearbyHazardEntry {
  const e = scratch._nearbyHazardsPool.pop() ?? { type, x: 0, y: 0, dist: 0 };
  e.type = type;
  return e;
}

/** Return all current entries from out's variable arrays back to the pool so
 *  the next buildAwareness call starts with empty arrays + a full pool. */
function recycleScratch(scratch: AwarenessScratch): void {
  const snap = scratch.snapshot;
  for (let i = 0; i < snap.airborneAbove.length; i++) scratch._airborneAbovePool.push(snap.airborneAbove[i]);
  snap.airborneAbove.length = 0;
  for (let i = 0; i < snap.nearbyHazards.length; i++) scratch._nearbyHazardsPool.push(snap.nearbyHazards[i]);
  snap.nearbyHazards.length = 0;
}

/** Shortest horizontal distance accounting for screen wrap */
function wrapDx(dx: number): number {
  if (dx > CANVAS_WIDTH / 2) return dx - CANVAS_WIDTH;
  if (dx < -CANVAS_WIDTH / 2) return dx + CANVAS_WIDTH;
  return dx;
}

/** Wrap-aware distance only. Hot path on bot decision frames — returns a
 *  number to avoid the object-literal GC pressure of an {dx,dy,dist} return.
 *  When the caller also needs dx/dy, compute them separately via wrapDx. */
function wrapDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = wrapDx(bx - ax);
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Find which platform a position is standing on (-1 if none) */
function findPlatformIdx(x: number, y: number, arena: Arena): number {
  const feetY = y + PLAYER_HEIGHT;
  for (let i = 0; i < arena.platforms.length; i++) {
    const p = arena.platforms[i];
    if (x + PLAYER_WIDTH > p.x && x < p.x + p.width &&
        feetY >= p.y - 5 && feetY <= p.y + 10) {
      return i;
    }
  }
  return -1;
}

/** Find nearest platform to a world position (for airborne targets) */
function nearestPlatformIdx(x: number, y: number, arena: Arena): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < arena.platforms.length; i++) {
    const p = arena.platforms[i];
    const cx = p.x + p.width / 2;
    const cy = p.y;
    const dx = x - cx;
    const dy = y - cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Allocating wrapper kept for tests + any one-shot callers. Hot paths
 *  (AIController.computeIdealInput at 60Hz × N bots) should call
 *  `buildAwarenessInto` with a long-lived scratch instead. */
export function buildAwareness(
  self: Player,
  state: MatchState,
  arena: Arena,
  awarenessRadius: number,
  pathfindingDepth: number = 0,
  preferSafePath: boolean = false,
  mirrorNav: boolean = false,
): AwarenessSnapshot {
  return buildAwarenessInto(createAwarenessScratch(), self, state, arena, awarenessRadius, pathfindingDepth, preferSafePath, mirrorNav);
}

export function buildAwarenessInto(
  scratch: AwarenessScratch,
  self: Player,
  state: MatchState,
  arena: Arena,
  awarenessRadius: number,
  pathfindingDepth: number = 0,
  preferSafePath: boolean = false,
  mirrorNav: boolean = false,
): AwarenessSnapshot {
  return perfTrace.measure('awareness', () =>
    _buildAwarenessImpl(scratch, self, state, arena, awarenessRadius, pathfindingDepth, preferSafePath, mirrorNav),
  );
}

function _buildAwarenessImpl(
  scratch: AwarenessScratch,
  self: Player,
  state: MatchState,
  arena: Arena,
  awarenessRadius: number,
  pathfindingDepth: number = 0,
  preferSafePath: boolean = false,
  mirrorNav: boolean = false,
): AwarenessSnapshot {
  recycleScratch(scratch);
  const snap = scratch.snapshot;
  const selfOnGround = self.state !== 'airborne';
  const selfAirborne = self.state === 'airborne';

  // Single pass over all players: nearest enemy, stomp target/threat, airborne above,
  // roam target, priority target, clustering, leader score — avoids separate loops.
  // Nullable subfields use scratch instances; null = absent.
  let nearestEnemy: AwarenessSnapshot['nearestEnemy'] = null;
  let nearestDist = Infinity;
  let stompTarget: AwarenessSnapshot['stompTarget'] = null;
  let bestStompDist = Infinity;
  let stompThreat: AwarenessSnapshot['stompThreat'] = null;
  let closestThreatDist = Infinity;
  const airborneAbove = snap.airborneAbove;
  let roamTarget: AwarenessSnapshot['roamTarget'] = null;
  let bestRoamDist = Infinity;
  let priorityTarget: AwarenessSnapshot['priorityTarget'] = null;
  let bestJuiciness = 0;
  let nearbyBotCount = 0;
  let leaderScore = 0;

  for (const p of state.players) {
    if (p.active && p.score > leaderScore) leaderScore = p.score;
    if (p.id === self.id) continue;
    if (!p.active) continue;

    // Clustering: count nearby bots
    if (isBotSlot(p.id) && p.state !== 'splat' && p.state !== 'respawning') {
      const bDist = wrapDistance(self.x, self.y, p.x, p.y);
      if (bDist < 120) nearbyBotCount++;
    }

    if (p.state === 'splat' || p.state === 'respawning') continue;

    const dx = wrapDx(p.x - self.x);
    const dy = p.y - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Nearest enemy (within awareness radius)
    if (dist < awarenessRadius && dist < nearestDist) {
      nearestDist = dist;
      const ne = scratch._nearestEnemy;
      ne.x = p.x; ne.y = p.y; ne.vx = p.vx; ne.vy = p.vy;
      ne.dx = dx; ne.dy = dy; ne.dist = dist; ne.score = p.score;
      nearestEnemy = ne;
    }

    // Priority target: fat, slowed, high-score, or streaking enemies are juicy
    if (dist < awarenessRadius && p.invincibleTimer <= 0) {
      let juiciness = 0;
      if (p.fatTimer > 0) juiciness += 3;          // fat = big easy target
      if (p.slowTimer > 0) juiciness += 2;          // slowed = can't escape
      if (p.killStreak >= 3) juiciness += 1.5;      // end their streak
      if (p.score >= 10) juiciness += p.score * 0.1; // high-score = high-value
      // Discount by distance — nearby juicy targets are much better
      if (juiciness > 0) {
        juiciness *= Math.max(0.3, 1 - dist / 500);
        if (juiciness > bestJuiciness) {
          bestJuiciness = juiciness;
          const pt = scratch._priorityTarget;
          pt.x = p.x; pt.y = p.y; pt.dx = dx; pt.dy = dy; pt.dist = dist; pt.juiciness = juiciness;
          priorityTarget = pt;
        }
      }
    }

    // Stomp target: below, horizontally aligned
    if (dy > 0 && dy < 200 && Math.abs(dx) < 80 && dist < awarenessRadius && dist < bestStompDist) {
      bestStompDist = dist;
      const st = scratch._stompTarget;
      st.x = p.x; st.y = p.y; st.dx = dx; st.dist = dist;
      stompTarget = st;
    }

    // Stomp threat: above, falling
    if (dy < 0 && dy > -200 && Math.abs(dx) < 60 && p.vy > 0 && dist < awarenessRadius && dist < closestThreatDist) {
      closestThreatDist = dist;
      const th = scratch._stompThreat;
      th.x = p.x; th.y = p.y; th.dist = dist;
      stompThreat = th;
    }

    // Airborne above (broader than threat)
    if (p.state === 'airborne' && dy < 0 && dy > -250 && Math.abs(dx) < 100 && dist < 300) {
      const entry = takeAirborneEntry(scratch);
      entry.x = p.x; entry.dx = dx; entry.dy = dy; entry.dist = dist;
      airborneAbove.push(entry);
    }

    // Roam target: nearest enemy on full map (ignores awareness radius)
    if (dist < bestRoamDist) {
      bestRoamDist = dist;
      const rt = scratch._roamTarget;
      rt.x = p.x; rt.y = p.y; rt.dx = dx;
      roamTarget = rt;
    }
  }

  // Find nearest carrot (wrap-aware)
  let nearestCarrot: AwarenessSnapshot['nearestCarrot'] = null;
  let bestCarrotDist = Infinity;
  for (const c of state.carrots) {
    if (!c.active) continue;
    const dist = wrapDistance(self.x, self.y, c.x, c.y);
    if (dist < awarenessRadius && dist < bestCarrotDist) {
      bestCarrotDist = dist;
      const nc = scratch._nearestCarrot;
      nc.x = c.x; nc.y = c.y; nc.dist = dist;
      nearestCarrot = nc;
    }
  }

  // Find all nearby hazards (hazard zones, thorns, ghosts, lava rocks). Inlined
  // to avoid allocating a closure per buildAwareness. Entries come from the
  // hazard pool; nearestHazard reuses a dedicated scratch.
  const nearbyHazards = snap.nearbyHazards;
  let nearestHazard: AwarenessSnapshot['nearestHazard'] = null;
  let bestHazardDist = Infinity;
  const HAZARD_DETECT_RADIUS = 200;
  const hazardRadius = Math.max(awarenessRadius, HAZARD_DETECT_RADIUS);

  for (const hz of arena.hazardZones ?? []) {
    const hx = hz.x + hz.width / 2, hy = hz.y + hz.height / 2;
    const dx = hx - self.x, dy = hy - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < hazardRadius) {
      const entry = takeHazardEntry(scratch, 'lava');
      entry.x = hx; entry.y = hy; entry.dist = dist;
      nearbyHazards.push(entry);
      if (dist < bestHazardDist) {
        bestHazardDist = dist;
        const nh = scratch._nearestHazard;
        nh.type = 'lava'; nh.x = hx; nh.y = hy; nh.dist = dist;
        nearestHazard = nh;
      }
    }
  }
  for (const t of state.thorns) {
    if (t.growTimer > 0 || t.hit) continue;
    const dx = t.x - self.x, dy = t.y - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < hazardRadius) {
      const entry = takeHazardEntry(scratch, 'thorn');
      entry.x = t.x; entry.y = t.y; entry.dist = dist;
      nearbyHazards.push(entry);
      if (dist < bestHazardDist) {
        bestHazardDist = dist;
        const nh = scratch._nearestHazard;
        nh.type = 'thorn'; nh.x = t.x; nh.y = t.y; nh.dist = dist;
        nearestHazard = nh;
      }
    }
  }
  for (const g of state.ghosts) {
    const dx = g.x - self.x, dy = g.y - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < hazardRadius) {
      const entry = takeHazardEntry(scratch, 'ghost');
      entry.x = g.x; entry.y = g.y; entry.dist = dist;
      nearbyHazards.push(entry);
      if (dist < bestHazardDist) {
        bestHazardDist = dist;
        const nh = scratch._nearestHazard;
        nh.type = 'ghost'; nh.x = g.x; nh.y = g.y; nh.dist = dist;
        nearestHazard = nh;
      }
    }
  }
  for (const r of state.lavaRocks) {
    if (!r.active) continue;
    const dx = r.x - self.x, dy = r.y - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < hazardRadius) {
      const entry = takeHazardEntry(scratch, 'lavaRock');
      entry.x = r.x; entry.y = r.y; entry.dist = dist;
      nearbyHazards.push(entry);
      if (dist < bestHazardDist) {
        bestHazardDist = dist;
        const nh = scratch._nearestHazard;
        nh.type = 'lavaRock'; nh.x = r.x; nh.y = r.y; nh.dist = dist;
        nearestHazard = nh;
      }
    }
  }

  // Find nearest platform above and below (wider horizontal range for zigzag stairs)
  let nearestPlatformAbove: AwarenessSnapshot['nearestPlatformAbove'] = null;
  let nearestPlatformBelow: AwarenessSnapshot['nearestPlatformBelow'] = null;
  let bestAboveDy = Infinity;
  let bestBelowDy = Infinity;
  for (const plat of arena.platforms) {
    // 200px horizontal reach — wide enough for zigzag staircases and offset platforms
    if (self.x + PLAYER_WIDTH < plat.x - 200 || self.x > plat.x + plat.width + 200) continue;
    const platTop = plat.y;
    const dy = platTop - (self.y + PLAYER_HEIGHT);
    if (dy < -20 && -dy < bestAboveDy) {
      bestAboveDy = -dy;
      const a = scratch._nearestPlatformAbove;
      a.x = plat.x; a.y = plat.y; a.width = plat.width; a.dy = dy;
      nearestPlatformAbove = a;
    }
    if (dy > 10 && dy < bestBelowDy) {
      bestBelowDy = dy;
      const b = scratch._nearestPlatformBelow;
      b.x = plat.x; b.y = plat.y; b.width = plat.width; b.dy = dy;
      nearestPlatformBelow = b;
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
        const lp = scratch._landingPlatform;
        lp.x = plat.x; lp.y = plat.y; lp.width = plat.width; lp.centerDx = centerDx;
        landingPlatform = lp;
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


  // Effect zones — single pass for zero-G, currents, geysers, and geyser escape
  let inZeroG = false;
  let inCurrent = 0;
  let nearGeyser: AwarenessSnapshot['nearGeyser'] = null;
  let geyserEscapeDx = 0;
  let geyserIdx = 0;
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
        const gs = geyserIdx < state.geyserStates.length ? state.geyserStates[geyserIdx] : null;
        const ng = scratch._nearGeyser;
        ng.x = geyserCx; ng.y = zone.y;
        ng.active = gs?.active ?? false;
        ng.timer = gs?.timer ?? 99;
        nearGeyser = ng;
      }
      // Geyser escape: compute direction to nearest zone edge
      if (inZone) {
        const selfCx = self.x + PLAYER_WIDTH / 2;
        const distToLeft = selfCx - zone.x;
        const distToRight = zone.x + zone.width - selfCx;
        geyserEscapeDx = distToLeft < distToRight ? -(distToLeft + 30) : (distToRight + 30);
      }
      geyserIdx++;
    }
  }

  // Override roam target with nearest carrot if one exists (carrot > enemy for roaming).
  // Note: nearestCarrot and roamTarget share scratch only when roamTarget was
  // pointing at the carrot scratch — they're distinct scratch instances, so
  // mutating roamTarget is safe.
  if (nearestCarrot) {
    const dx = wrapDx(nearestCarrot.x - self.x);
    const rt = scratch._roamTarget;
    rt.x = nearestCarrot.x; rt.y = nearestCarrot.y; rt.dx = dx;
    roamTarget = rt;
  }

  // Elevated platform check (above ground level y=650)
  let onElevatedPlatform = false;
  if (selfOnGround && self.y + PLAYER_HEIGHT < 640) {
    onElevatedPlatform = true;
  }

  // Nav graph: find current platform + compute navTarget
  const currentPlatformIdx = selfOnGround ? findPlatformIdx(self.x, self.y, arena) : -1;
  let navTarget: AwarenessSnapshot['navTarget'] = null;

  if (pathfindingDepth > 0 && currentPlatformIdx >= 0) {
    const nav = getArenaNav(arena.id);
    if (nav) {
      // Determine goal: nearest enemy, priority target, or roam target
      let goalX = 0, goalY = 0;
      let hasGoal = false;
      if (nearestEnemy) {
        goalX = nearestEnemy.x; goalY = nearestEnemy.y; hasGoal = true;
      } else if (roamTarget) {
        goalX = roamTarget.x; goalY = roamTarget.y; hasGoal = true;
      }
      if (hasGoal) {
        const goalPlatIdx = findPlatformIdx(goalX, goalY, arena);
        const goalIdx = goalPlatIdx >= 0 ? goalPlatIdx : nearestPlatformIdx(goalX, goalY, arena);

        if (goalIdx !== currentPlatformIdx) {
          const hopTable = preferSafePath && nav.safeHop ? nav.safeHop : nav.nextHop;
          let nextIdx = hopTable[currentPlatformIdx]?.[goalIdx] ?? -2;

          // Medium difficulty: clamp to 1-hop (don't follow full multi-hop paths)
          if (pathfindingDepth === 1 && nextIdx >= 0) {
            // Only use the immediate next hop, don't chain further
            // (This is already what nextHop gives us — single next step)
          }

          if (nextIdx >= 0 && nextIdx < arena.platforms.length) {
            // Find the edge to get approach info
            const edges = nav.edges[currentPlatformIdx];
            let edgeType: 'j' | 'd' | 'w' | 'g' | 'z' = 'j';
            let approachX = arena.platforms[nextIdx].x + arena.platforms[nextIdx].width / 2;
            for (const e of edges) {
              if (e.t === nextIdx) {
                edgeType = e.y;
                approachX = mirrorNav ? CANVAS_WIDTH - e.x : e.x;
                break;
              }
            }
            const p = arena.platforms[nextIdx];
            const nt = scratch._navTarget;
            nt.x = p.x; nt.y = p.y; nt.width = p.width;
            nt.approachX = approachX; nt.type = edgeType;
            navTarget = nt;
          }
        }
      }
    }
  }

  // Nav hints: manual overrides for obstacle-blocked areas
  if (navTarget && arena.navHints) {
    for (const hint of arena.navHints) {
      if (hint.onPlatform === currentPlatformIdx &&
          self.x >= hint.inZone.x && self.x < hint.inZone.x + hint.inZone.width) {
        const hp = arena.platforms[hint.goTo];
        const nt = scratch._navTarget;
        nt.x = hp.x; nt.y = hp.y; nt.width = hp.width;
        nt.approachX = hint.approachX; nt.type = hint.type;
        navTarget = nt;
        break;
      }
    }
  }

  // Fill the snapshot's flat fields and pointers; the snapshot itself is the
  // long-lived scratch.snapshot, mutated in place.
  const self_ = snap.self;
  self_.x = self.x; self_.y = self.y; self_.vx = self.vx; self_.vy = self.vy;
  self_.onGround = selfOnGround; self_.score = self.score;
  self_.slowed = self.slowTimer > 0; self_.fat = self.fatTimer > 0;
  self_.invincible = self.invincibleTimer > 0;

  snap.nearestEnemy = nearestEnemy;
  snap.priorityTarget = priorityTarget;
  snap.roamTarget = roamTarget;
  snap.stompTarget = stompTarget;
  snap.stompThreat = stompThreat;
  snap.nearestCarrot = nearestCarrot;
  snap.nearestHazard = nearestHazard;
  snap.nearestPlatformAbove = nearestPlatformAbove;
  snap.nearestPlatformBelow = nearestPlatformBelow;
  snap.landingPlatform = landingPlatform;
  snap.nearEdge = nearEdge;
  snap.inZeroG = inZeroG;
  snap.inCurrent = inCurrent;
  snap.nearGeyser = nearGeyser;
  snap.geyserEscapeDx = geyserEscapeDx;
  snap.nearbyBotCount = nearbyBotCount;
  snap.leaderScore = leaderScore;
  snap.onElevatedPlatform = onElevatedPlatform;
  snap.currentPlatformIdx = currentPlatformIdx;
  snap.navTarget = navTarget;
  // airborneAbove + nearbyHazards arrays already live on snap and were
  // populated in place above.
  return snap;
}

