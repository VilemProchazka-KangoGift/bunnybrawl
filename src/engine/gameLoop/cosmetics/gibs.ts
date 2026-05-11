import type { Gib, GibType, Player, MatchSettings, EffectZone, Platform } from '../../types';
import {
  BLOOD_COLOR,
  GIB_GRAVITY, GIB_LAUNCH_SPEED_MIN, GIB_LAUNCH_SPEED_MAX, GIB_ROTATION_MAX,
  GIB_BOUNCE_FACTOR, GIB_GEYSER_STRENGTH_MULT, GIB_MAX_FLIGHT, GIB_MAX_COUNT,
} from '../../constants';
import { getCharacterGibs } from '../../characters';
import { swapRemove } from '../../themes/utils';
import { CONFETTI_COLORS } from './particles';

/** Hard cap on the recycled-Gib pool. Same order of magnitude as the particle
 *  pool cap (300) — covers a normal-mode kill burst (~40 gibs) plus a few
 *  rounds of turnover. ExtremeGore churns at the cap; that's fine, dropped
 *  gibs go to GC instead of growing the pool unboundedly across a match. */
export const GIB_FREELIST_CAP = 600;

export function launchGib(
  gibs: Gib[], freeList: Gib[],
  cx: number, cy: number, spread: number,
  angleMin: number, angleMax: number, speedMin: number, speedMax: number,
  w: number, h: number,
  color: string, darkColor: string, lightColor: string,
  characterName: string, gibType: GibType,
): void {
  const angle = -Math.PI * (angleMin + Math.random() * (angleMax - angleMin));
  const speed = speedMin + Math.random() * (speedMax - speedMin);
  const x = cx + (Math.random() - 0.5) * spread;
  const y = cy + (Math.random() - 0.5) * spread * 0.7;
  const vx = Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1);
  const vy = Math.sin(angle) * speed;
  const rotation = Math.random() * Math.PI * 2;
  const rotationSpeed = (Math.random() - 0.5) * 2 * GIB_ROTATION_MAX;
  const recycled = freeList.pop();
  if (recycled) {
    recycled.x = x; recycled.y = y; recycled.vx = vx; recycled.vy = vy;
    recycled.rotation = rotation; recycled.rotationSpeed = rotationSpeed;
    recycled.width = w; recycled.height = h;
    recycled.color = color; recycled.darkColor = darkColor; recycled.lightColor = lightColor;
    recycled.characterName = characterName; recycled.gibType = gibType;
    recycled.bounced = false;
    recycled.life = GIB_MAX_FLIGHT;
    gibs.push(recycled);
  } else {
    gibs.push({
      x, y, vx, vy, rotation, rotationSpeed,
      width: w, height: h,
      color, darkColor, lightColor,
      characterName, gibType,
      bounced: false,
      life: GIB_MAX_FLIGHT,
    });
  }
}

export function spawnGibs(
  gibs: Gib[], freeList: Gib[], victim: Player, settings: MatchSettings,
): void {
  const cx = victim.x + victim.width / 2;
  const cy = victim.y + victim.height / 2;
  const { color, darkColor, lightColor, name } = victim.character;
  const gore = settings.goreMode;
  const extreme = settings.mods.extremeGore;
  const mult = extreme ? 10 : 1;
  const pickConfetti = () => CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
  // Character body part gibs
  const gibDefs = getCharacterGibs(name);
  if (gibDefs) {
    for (let r = 0; r < mult; r++) {
      for (const def of gibDefs) {
        launchGib(gibs, freeList, cx, cy, 12 + r * 3, 0.15, 0.85, GIB_LAUNCH_SPEED_MIN, GIB_LAUNCH_SPEED_MAX,
          def.width, def.height, color, darkColor, lightColor, name, def.gibType);
      }
    }
  }
  // Chunk gibs
  const chunkCount = (5 + Math.floor(Math.random() * 4)) * mult;
  for (let i = 0; i < chunkCount; i++) {
    const size = 4 + Math.random() * 6;
    const c = gore ? BLOOD_COLOR : pickConfetti();
    launchGib(gibs, freeList, cx, cy, 16, 0.1, 0.9, GIB_LAUNCH_SPEED_MIN * 0.8, GIB_LAUNCH_SPEED_MAX,
      size, size * (0.6 + Math.random() * 0.4), c, c, c, '', 'body');
  }
  // Micro drop gibs
  const microCount = (25 + Math.floor(Math.random() * 15)) * mult;
  for (let i = 0; i < microCount; i++) {
    const size = 1.5 + Math.random() * 2.5;
    const c = gore ? BLOOD_COLOR : pickConfetti();
    launchGib(gibs, freeList, cx, cy, 20, 0.05, 0.95, GIB_LAUNCH_SPEED_MIN * 0.5, GIB_LAUNCH_SPEED_MAX * 1.2,
      size, size, c, c, c, '', 'body');
  }
  // Cap airborne gibs — dropped objects rejoin the free list up to GIB_FREELIST_CAP.
  const gibCap = extreme ? GIB_MAX_COUNT * 10 : GIB_MAX_COUNT;
  while (gibs.length > gibCap) {
    const dropped = gibs[0];
    swapRemove(gibs, 0);
    if (freeList.length < GIB_FREELIST_CAP) freeList.push(dropped);
  }
}

export function updateGibs(
  gibs: Gib[], freeList: Gib[],
  platforms: readonly Platform[], effectZones: readonly EffectZone[] | undefined,
  geyserIndexMap: ReadonlyMap<EffectZone, number>,
  geyserStates: ReadonlyArray<{ active: boolean }>,
  groundedGibs: Gib[],
  dt: number,
): void {
  for (let i = gibs.length - 1; i >= 0; i--) {
    const g = gibs[i];
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.vy += GIB_GRAVITY * dt;
    g.rotation += g.rotationSpeed * dt;
    g.life -= dt;
    // Effect zone interactions
    if (effectZones) {
      for (let zi = 0; zi < effectZones.length; zi++) {
        const zone: EffectZone = effectZones[zi];
        if (g.x < zone.x || g.x > zone.x + zone.width || g.y < zone.y || g.y > zone.y + zone.height) continue;
        if (zone.type === 'zero_g') {
          if (g.vy > 0) g.vy *= 0.92;
          else if (g.vy < 0) g.vy *= 1.03;
        } else if (zone.type === 'current') {
          g.vx += (zone.vx || 0) * dt;
          g.vy += (zone.vy || 0) * dt;
        } else if (zone.type === 'geyser') {
          const geyserIdx = geyserIndexMap.get(zone) ?? -1;
          if (geyserIdx >= 0 && geyserStates[geyserIdx]?.active) {
            g.vy = Math.min(g.vy, (zone.strength || -550) * GIB_GEYSER_STRENGTH_MULT);
          }
        }
      }
    }
    // Platform collision
    let settled = false;
    const gibBottom = g.y + g.height / 2;
    const prevBottom = gibBottom - g.vy * dt;
    for (let pi = 0; pi < platforms.length; pi++) {
      const plat = platforms[pi];
      if (prevBottom < plat.y && gibBottom >= plat.y &&
          g.x + g.width / 2 > plat.x && g.x - g.width / 2 < plat.x + plat.width) {
        if (!g.bounced) {
          g.vy = -Math.abs(g.vy) * GIB_BOUNCE_FACTOR;
          g.vx *= 0.6;
          g.rotationSpeed *= 0.5;
          g.bounced = true;
          g.y = plat.y - g.height / 2;
        } else {
          g.y = plat.y - g.height / 2;
          g.vx = 0; g.vy = 0; g.rotationSpeed = 0;
          groundedGibs.push(g);
          swapRemove(gibs, i);
          settled = true;
        }
        break;
      }
    }
    if (settled) continue;
    if (g.life <= 0) {
      // Expired in flight — recycle. (Settled gibs go to groundedGibs first;
      // they're recycled in ParticleSystem.bakeToRenderer after the renderer
      // copies their data into the bg canvas.)
      if (freeList.length < GIB_FREELIST_CAP) freeList.push(g);
      swapRemove(gibs, i);
    }
  }
}
