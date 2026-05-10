/**
 * Worker-only replacement for the main-thread `audio` module. Aliased in
 * via `vite.config.ts > worker.plugins` when the worker bundle is built.
 *
 * Every call posts a `worker:engineEvent` to main, which dispatches to the
 * real AudioManager. The worker never touches Howler / Web Audio.
 *
 * Keep the public API in lockstep with `engine/audio/index.ts`. Missing
 * methods would crash the worker the moment Simulator triggers them.
 */

import type { WorkerEngineEventMsg } from '../messages';

/** Audio events the stub can emit — share the wire-format union so adding a
 *  new audio kind to `messages.ts > WorkerEngineEventMsg` ripples here at
 *  compile time. */
type EngineAudioEvent = Extract<WorkerEngineEventMsg, {
  kind: 'sfx' | 'animal' | 'musicStart' | 'musicStop' | 'soundStop'
      | 'soundVolume' | 'allGameSoundsStop' | 'paused' | 'resumeContext'
      | 'preloadArena';
}>;

declare const self: DedicatedWorkerGlobalScope;

function post(ev: EngineAudioEvent): void {
  self.postMessage(ev);
}

export const audio = {
  init(): void { /* AudioManager init runs on main only */ },
  play(name: string): void { post({ type: 'worker:engineEvent', kind: 'sfx', name }); },
  playAnimal(name: string): void { post({ type: 'worker:engineEvent', kind: 'animal', name }); },
  playMusic(themeId: string): void { post({ type: 'worker:engineEvent', kind: 'musicStart', themeId }); },
  playMenuMusic(): void { /* menu music is main-only */ },
  stopMusic(): void { post({ type: 'worker:engineEvent', kind: 'musicStop' }); },
  stop(name: string): void { post({ type: 'worker:engineEvent', kind: 'soundStop', name }); },
  setVolume(name: string, volume: number): void { post({ type: 'worker:engineEvent', kind: 'soundVolume', name, volume }); },
  stopAllGameSounds(): void { post({ type: 'worker:engineEvent', kind: 'allGameSoundsStop' }); },
  setPaused(paused: boolean, _resumeThemeId?: string): void {
    post({ type: 'worker:engineEvent', kind: 'paused', paused });
  },
  resumeContext(): void { post({ type: 'worker:engineEvent', kind: 'resumeContext' }); },
  setMuted(_muted: boolean): void { /* user-toggle lives on main */ },
  isMuted(): boolean { return false; },
  setMusicDisabled(_disabled: boolean): void { /* main-only pref */ },
  isMusicDisabled(): boolean { return false; },
  setMusicVolume(_v: number): void { /* main-only */ },
  getMusicVolume(): number { return 1; },
  subscribeMusic(_listener: () => void): () => void { return () => {}; },
  preloadArena(arenaId: string): Promise<void> {
    post({ type: 'worker:engineEvent', kind: 'preloadArena', arenaId });
    return Promise.resolve();
  },
  hasPreloadedArena(_arenaId: string): boolean { return true; },
};
