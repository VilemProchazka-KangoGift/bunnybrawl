import type { MatchState, Platform } from '../../types';
import {
  SPAWN_EXCLUSION_MARGIN, SPRING_VERTICAL_CLEARANCE, SPAWN_RETRY_ATTEMPTS,
  HAZARD_LIFETIME, HAZARD_GROW_TIME, THORN_WIDTH, THORN_HEIGHT, THORN_Y_OFFSET,
} from '../../constants';
import { swapRemove } from '../../themes/utils';

const f = Math.fround;

/** Check if any active player is standing on the given platform near x */
export function playerNearSpawn(state: MatchState, plat: Platform, spawnX: number): boolean {
  const margin = SPAWN_EXCLUSION_MARGIN;
  for (const p of state.players) {
    if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
    const feetY = p.y + p.height;
    if (feetY >= plat.y - 4 && feetY <= plat.y + 6 &&
        p.x + p.width > plat.x && p.x < plat.x + plat.width &&
        Math.abs((p.x + p.width / 2) - spawnX) < margin) {
      return true;
    }
  }
  return false;
}

export function spawnSpring(
  state: MatchState,
  floatingPlatforms: ReadonlyArray<{ plat: Platform; idx: number }>,
  allPlatforms: readonly Platform[],
  noSprings: boolean | undefined,
  gameRandom: () => number,
): void {
  if (noSprings) return;
  if (floatingPlatforms.length === 0) return;
  const minClearance = SPRING_VERTICAL_CLEARANCE;
  const candidates = floatingPlatforms.filter(({ plat }) => {
    for (const other of allPlatforms) {
      if (other === plat) continue;
      if (other.y < plat.y && plat.y - other.y < minClearance &&
          other.x < plat.x + plat.width && other.x + other.width > plat.x) {
        return false;
      }
    }
    return true;
  });
  if (candidates.length === 0) return;
  // Pre-generate all candidates to consume a fixed number of gameRandom() calls
  const attempts: Array<{ fp: typeof candidates[0]; x: number }> = [];
  for (let i = 0; i < SPAWN_RETRY_ATTEMPTS; i++) {
    const fp = candidates[Math.floor(gameRandom() * candidates.length)];
    const x = fp.plat.x + 20 + gameRandom() * (fp.plat.width - 40);
    attempts.push({ fp, x });
  }
  for (const { fp, x } of attempts) {
    if (!playerNearSpawn(state, fp.plat, x)) {
      state.springs.push({
        x, y: fp.plat.y, platformIndex: fp.idx,
        bounceTimer: 0, life: HAZARD_LIFETIME, growTimer: HAZARD_GROW_TIME,
      });
      return;
    }
  }
}

export function spawnThorn(
  state: MatchState,
  floatingPlatforms: ReadonlyArray<{ plat: Platform; idx: number }>,
  gameRandom: () => number,
): void {
  if (floatingPlatforms.length === 0) return;
  const attempts: Array<{ fp: { plat: Platform; idx: number }; x: number }> = [];
  for (let i = 0; i < SPAWN_RETRY_ATTEMPTS; i++) {
    const fp = floatingPlatforms[Math.floor(gameRandom() * floatingPlatforms.length)];
    const x = fp.plat.x + 10 + gameRandom() * (fp.plat.width - 44);
    attempts.push({ fp, x });
  }
  for (const { fp, x } of attempts) {
    if (!playerNearSpawn(state, fp.plat, x)) {
      state.thorns.push({
        x, y: fp.plat.y - THORN_Y_OFFSET, width: THORN_WIDTH, height: THORN_HEIGHT,
        platformIndex: fp.idx, life: HAZARD_LIFETIME, growTimer: HAZARD_GROW_TIME, hit: false,
      });
      return;
    }
  }
}

export function updateHazardLifetimes(state: MatchState, dt: number): void {
  for (const s of state.springs) {
    s.life = f(s.life - dt);
    if (s.growTimer > 0) s.growTimer = f(s.growTimer - dt);
    if (s.bounceTimer > 0) s.bounceTimer = f(s.bounceTimer - dt);
  }
  for (let i = state.springs.length - 1; i >= 0; i--) {
    if (state.springs[i].life <= 0) {
      swapRemove(state.springs, i);
    }
  }
  for (const t of state.thorns) {
    t.life = f(t.life - dt);
    if (t.growTimer > 0) t.growTimer = f(t.growTimer - dt);
  }
  for (let i = state.thorns.length - 1; i >= 0; i--) {
    if (state.thorns[i].life <= 0 || state.thorns[i].hit) {
      swapRemove(state.thorns, i);
    }
  }
}
