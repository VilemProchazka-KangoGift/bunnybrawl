import type { PlayerSlot, MatchState, MatchSettings } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import { audio } from '../../audio';
import { randRange } from '../../themes/utils';

/** Per-player SFX cooldown state. All values decay toward 0; sound plays when <= 0. */
export interface SfxCooldowns {
  land: number;
  headbonk: number;
  crouch: number;
}

export function getOrCreateCooldowns(map: Map<PlayerSlot, SfxCooldowns>, id: PlayerSlot): SfxCooldowns {
  let cd = map.get(id);
  if (!cd) { cd = { land: 0, headbonk: 0, crouch: 0 }; map.set(id, cd); }
  return cd;
}

export function decaySfxCooldowns(
  sfxCooldowns: Map<PlayerSlot, SfxCooldowns>,
  playerId: PlayerSlot, dt: number,
): void {
  const cd = sfxCooldowns.get(playerId);
  if (!cd) return;
  if (cd.land > 0) cd.land -= dt;
  if (cd.headbonk > 0) cd.headbonk -= dt;
  if (cd.crouch > 0) cd.crouch -= dt;
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
