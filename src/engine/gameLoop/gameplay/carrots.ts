import type { MatchState, Arena, EffectZone } from '../../types';
import { CARROT_SIZE } from '../../constants';
import { swapRemove } from '../../themes/utils';

export function spawnCarrot(
  state: MatchState, arena: Arena,
  cachedZeroGZones: readonly EffectZone[],
  gameRandom: () => number,
): void {
  const candidates: Array<{ x: number; y: number; distSq: number }> = [];

  const minDistSqTo = (cx: number, cy: number): number => {
    let minSq = Infinity;
    for (const p of state.players) {
      if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
      const dx = cx - (p.x + p.width / 2);
      const dy = cy - (p.y + p.height / 2);
      const sq = dx * dx + dy * dy;
      if (sq < minSq) minSq = sq;
    }
    for (const c of state.carrots) {
      if (!c.active) continue;
      const dx = cx - c.x;
      const dy = cy - c.y;
      const sq = dx * dx + dy * dy;
      if (sq < minSq) minSq = sq;
    }
    return minSq;
  };

  for (const plat of arena.platforms) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cx = plat.x + 20 + gameRandom() * (plat.width - 40);
      const cy = plat.y - CARROT_SIZE;
      candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const cx = plat.x + 20 + gameRandom() * (plat.width - 40);
      const cy = Math.max(CARROT_SIZE, plat.y - 60 - gameRandom() * 60);
      candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) });
    }
  }
  // Extra mid-air candidates inside zero-G zones
  for (const zone of cachedZeroGZones) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cx = zone.x + 30 + gameRandom() * (zone.width - 60);
      const cy = zone.y + 30 + gameRandom() * (zone.height - 60);
      candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) * 2.25 });
    }
  }
  // Extra candidates inside carrot zones
  if (arena.carrotZones) {
    for (const zone of arena.carrotZones) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const cx = zone.x + 20 + gameRandom() * (zone.width - 40);
        const cy = zone.y + 20 + gameRandom() * (zone.height - 40);
        candidates.push({ x: cx, y: cy, distSq: minDistSqTo(cx, cy) * 4 });
      }
    }
  }
  // Filter out candidates inside noSpawnZones
  const noSpawn = arena.noSpawnZones;
  if (noSpawn) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      for (const z of noSpawn) {
        if (c.x >= z.x && c.x <= z.x + z.width && c.y >= z.y && c.y <= z.y + z.height) {
          swapRemove(candidates, i);
          break;
        }
      }
    }
  }
  // Pick candidate farthest from players/carrots
  let bestIdx = 0;
  let bestDistSq = -1;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].distSq > bestDistSq) {
      bestDistSq = candidates[i].distSq;
      bestIdx = i;
    }
  }
  if (candidates.length > 0) {
    const spot = candidates[bestIdx];
    state.carrots.push({ x: spot.x, y: spot.y, active: true, spawnTime: state.timeElapsed });
  }
}
