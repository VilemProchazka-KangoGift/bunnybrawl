import type { MatchState, MatchSettings } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { Cooldowns } from '../../cooldowns';
import { randRange } from '../../themes/utils';

// SfxCooldowns + getOrCreateCooldowns + decaySfxCooldowns moved to
// src/engine/sfxCooldowns.ts so the Simulator can share them without pulling
// this file (and its theme/audio-adjacent dependencies) into the pure import graph.
export type { SfxCooldowns } from '../../sfxCooldowns';
export { getOrCreateCooldowns, decaySfxCooldowns } from '../../sfxCooldowns';

/**
 * Drive crowd-cheering loop volume based on score. Caller injects audio side
 * effects (start/stop the loop, modulate its volume) so this module stays
 * free of any direct audio import.
 */
export function updateCrowdCheering(
  state: MatchState,
  settings: MatchSettings,
  crowdStarted: boolean,
  playSound: (name: string) => void,
  setVolume: (name: string, volume: number) => void,
  stopSound: (name: string) => void,
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
      setVolume('crowd', 0.3);
    } else {
      setVolume('crowd', 0.15);
    }
  } else if (crowdStarted) {
    setVolume('crowd', 0);
    stopSound('crowd');
    crowdStarted = false;
  }
  return crowdStarted;
}

export function tickPeriodicAmbient(
  theme: ThemeConfig,
  periodicTimers: Cooldowns<string>,
  dt: number,
  playSound: (name: string) => void,
): void {
  const ambConfig = theme.ambientSoundConfig;
  if (!ambConfig?.periodic) return;
  for (const p of ambConfig.periodic) {
    if (periodicTimers.tick(p.sound, dt)) {
      playSound(p.sound);
      periodicTimers.set(p.sound, randRange(p.intervalRange));
    }
  }
}
