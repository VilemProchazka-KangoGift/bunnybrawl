import type { PlayerSlot, MatchState, MatchSettings } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import { audio } from '../../audio';
import { randRange } from '../../themes/utils';

export function decaySfxCooldowns(
  landCooldowns: Map<PlayerSlot, number>,
  headbonkCooldowns: Map<PlayerSlot, number>,
  crouchCooldowns: Map<PlayerSlot, number>,
  playerId: PlayerSlot, dt: number,
): void {
  const lc = landCooldowns.get(playerId);
  if (lc !== undefined && lc > 0) landCooldowns.set(playerId, lc - dt);
  const hc = headbonkCooldowns.get(playerId);
  if (hc !== undefined && hc > 0) headbonkCooldowns.set(playerId, hc - dt);
  const cc = crouchCooldowns.get(playerId);
  if (cc !== undefined && cc > 0) crouchCooldowns.set(playerId, cc - dt);
}

export function updateCrowdCheering(
  state: MatchState, settings: MatchSettings,
  crowdStarted: boolean, playSound: (name: string) => void,
): boolean {
  let leadScore = 0;
  for (const p of state.players) {
    if (p.active && p.score > leadScore) leadScore = p.score;
  }
  if (leadScore >= settings.killLimit - 3) {
    if (!crowdStarted) {
      playSound('crowd');
      crowdStarted = true;
    }
    if (leadScore >= settings.killLimit - 1) {
      audio.setVolume('crowd', 0.3);
    } else {
      audio.setVolume('crowd', 0.15);
    }
  } else if (crowdStarted) {
    audio.setVolume('crowd', 0);
    audio.stop('crowd');
    crowdStarted = false;
  }
  return crowdStarted;
}

export function tickPeriodicAmbient(
  theme: ThemeConfig, periodicTimers: Map<string, number>,
  dt: number, playSound: (name: string) => void,
): void {
  const ambConfig = theme.ambientSoundConfig;
  if (!ambConfig?.periodic) return;
  for (const p of ambConfig.periodic) {
    const remaining = (periodicTimers.get(p.sound) ?? 0) - dt;
    if (remaining <= 0) {
      playSound(p.sound);
      const next = randRange(p.intervalRange);
      periodicTimers.set(p.sound, next);
    } else {
      periodicTimers.set(p.sound, remaining);
    }
  }
}
