import type { Player, PlayerSlot, EffectZone } from '../../types';
import { aabbOverlap } from '../../physics';
import { audio } from '../../audio';

const f = Math.fround;

export function applyEffectZones(
  player: Player,
  effectZones: readonly EffectZone[],
  geyserIndexMap: ReadonlyMap<EffectZone, number>,
  geyserStates: ReadonlyArray<{ active: boolean }>,
  justLanded: boolean, wasAirborne: boolean, prevVy: number,
  landCooldowns: Map<PlayerSlot, number>,
  playSound: (name: string) => void,
  dt: number,
): void {
  for (let zi = 0; zi < effectZones.length; zi++) {
    const zone: EffectZone = effectZones[zi];
    if (!aabbOverlap(player.x, player.y, player.width, player.height, zone.x, zone.y, zone.width, zone.height)) continue;

    if (zone.type === 'zero_g') {
      if (player.vy > 0) {
        player.vy = f(player.vy * 0.92);
      } else if (player.vy < 0) {
        player.vy = f(player.vy * 1.03);
      }
    } else if (zone.type === 'current') {
      player.vx = f(player.vx + f((zone.vx || 0) * dt));
      player.vy = f(player.vy + f((zone.vy || 0) * dt));
      // Splash when entering waterfall
      if (justLanded || (wasAirborne && prevVy >= 200)) {
        const sc = landCooldowns.get(player.id) || 0;
        if (sc <= 0) {
          playSound('splash');
          landCooldowns.set(player.id, 0.3);
        }
      }
    } else if (zone.type === 'geyser') {
      const geyserIdx = geyserIndexMap.get(zone) ?? -1;
      if (geyserIdx >= 0 && geyserStates[geyserIdx]?.active) {
        player.vy = f(Math.min(player.vy, zone.strength || -550));
        player.state = 'airborne';
      }
    }
  }
}

export function updateZeroGSound(
  players: readonly Player[],
  cachedZeroGZones: readonly EffectZone[],
  zeroGSoundPlaying: boolean,
  playSound: (name: string) => void,
): boolean {
  if (cachedZeroGZones.length === 0) return zeroGSoundPlaying;
  let anyInZeroG = false;
  for (const p of players) {
    if (!p.active || p.state === 'splat' || p.state === 'respawning') continue;
    for (const z of cachedZeroGZones) {
      if (aabbOverlap(p.x, p.y, p.width, p.height, z.x, z.y, z.width, z.height)) {
        anyInZeroG = true;
        break;
      }
    }
    if (anyInZeroG) break;
  }
  if (anyInZeroG && !zeroGSoundPlaying) {
    playSound('zero_g');
    return true;
  } else if (!anyInZeroG && zeroGSoundPlaying) {
    audio.stop('zero_g');
    return false;
  }
  return zeroGSoundPlaying;
}
