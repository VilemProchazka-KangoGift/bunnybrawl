import { Howl, Howler } from 'howler';
import type { SoundName } from './types';
import { MusicManager } from './MusicManager';
import { registerAllSounds } from './soundRegistry';

class AudioManager {
  // Widened to string keys so external character packs can register sounds dynamically
  private sounds: Map<string, Howl> = new Map();
  private initialized = false;
  private muted = false;
  private backgroundMuted = false;
  private gamePaused = false;
  private _visibilityHandler: (() => void) | null = null;
  private music = new MusicManager();

  private updateHowlerMute(): void {
    Howler.mute(this.muted || this.backgroundMuted || this.gamePaused);
  }

  private syncMusicMute(): void {
    this.music.setMuted(this.muted);
  }

  /** Resume the Web Audio context if suspended/interrupted. Mobile OSes
   *  suspend on phone-call, screen-off, or backgrounding and won't auto-resume;
   *  Howler.mute() only flips a gain node, not the context state. Symptom of
   *  forgetting it: MP3 music plays (HTMLAudio) but procedural SFX stay silent
   *  (Web Audio). Called from visibility, `setPaused(false)`, `playMusic`,
   *  `playMenuMusic`, and the loading screen. */
  resumeContext(): void {
    const ctx = (Howler as unknown as { ctx?: AudioContext | null }).ctx;
    if (ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted' as AudioContextState)
        && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
  }

  init(): void {
    if (this.initialized) return;

    registerAllSounds(this.sounds);

    this._visibilityHandler = () => {
      this.backgroundMuted = document.hidden;
      this.updateHowlerMute();
      if (!document.hidden) this.resumeContext();
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);

    this.initialized = true;
  }

  play(name: SoundName | string): void {
    if (this.muted || this.backgroundMuted) return;
    if (!this.initialized) this.init();
    this.sounds.get(name)?.play();
  }

  stop(name: SoundName | string): void {
    this.sounds.get(name)?.stop();
  }

  /** Stop all in-game sounds (SFX, ambient loops, arena music). Menu music is preserved. */
  stopAllGameSounds(): void {
    for (const [, sound] of this.sounds) {
      sound.stop();
    }
    this.stopMusic();
    // Quit-from-pause would otherwise leave Howler globally muted.
    if (this.gamePaused) this.setPaused(false);
  }

  stopAll(): void {
    this.stopAllGameSounds();
    this.stopMenuMusic();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.syncMusicMute();
    if (this.muted) {
      this.stopAll();
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(name: SoundName | string, vol: number): void {
    const sound = this.sounds.get(name);
    if (sound) sound.volume(vol);
  }

  playAnimal(characterName: string): void {
    if (!this.initialized) this.init();
    const soundName = characterName.toLowerCase();
    if (this.sounds.has(soundName)) {
      this.play(soundName);
    }
  }

  /** Register a sound dynamically (for external character packs). */
  registerSound(name: string, howl: Howl): void {
    this.sounds.set(name, howl);
  }

  /** Check if a sound is registered. */
  hasSound(name: string): boolean {
    return this.sounds.has(name);
  }

  // ---- Music delegation ----

  setMusicDisabled(disabled: boolean): void {
    this.music.setMusicDisabled(disabled);
  }

  toggleMusicDisabled(): boolean {
    return this.music.toggleMusicDisabled();
  }

  isMusicDisabled(): boolean {
    return this.music.isMusicDisabled();
  }

  getMusicVolume(): number {
    return this.music.getMusicVolume();
  }

  setMusicVolume(v: number): void {
    this.music.setMusicVolume(v);
  }

  subscribeMusic(listener: () => void): () => void {
    return this.music.subscribe(listener);
  }

  setPaused(paused: boolean, themeId?: string): void {
    this.gamePaused = paused;
    this.updateHowlerMute();
    if (!paused) {
      this.resumeContext();
      if (themeId) this.playMusic(themeId);
    }
  }

  playMenuMusic(): void {
    this.syncMusicMute();
    this.resumeContext();
    this.music.playMenuMusic();
  }

  stopMenuMusic(): void {
    this.music.stopMenuMusic();
  }

  playMusic(themeId: string): void {
    if (!this.initialized) this.init();
    this.syncMusicMute();
    this.resumeContext();
    this.music.playMusic(themeId);
  }

  stopMusic(): void {
    this.music.stopMusic();
  }

  /** Preload an arena's music Howl. A later `playMusic(themeId)` will reuse it. */
  preloadArena(themeId: string): Promise<void> {
    return this.music.preloadArena(themeId);
  }

  /** True when the preloaded music matches `themeId`. Loading screens use
   *  this to verify readiness before flipping phase to 'playing'. */
  hasPreloadedArena(themeId: string): boolean {
    return this.music.hasPreloadedArena(themeId);
  }

  destroy(): void {
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    for (const sound of this.sounds.values()) {
      sound.unload();
    }
    this.sounds.clear();
    this.music.destroy();
    this.initialized = false;
  }
}

// Singleton
export const audio = new AudioManager();
