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

  init(): void {
    if (this.initialized) return;

    registerAllSounds(this.sounds);

    // Mute all audio when app goes to background (especially important on mobile)
    this._visibilityHandler = () => {
      if (document.hidden) {
        this.backgroundMuted = true;
        Howler.mute(true);
      } else {
        this.backgroundMuted = false;
        if (!this.muted && !this.gamePaused) Howler.mute(false);
      }
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
  }

  stopAll(): void {
    this.stopAllGameSounds();
    this.stopMenuMusic();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
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

  setPaused(paused: boolean, themeId?: string): void {
    this.gamePaused = paused;
    if (paused) {
      Howler.mute(true);
    } else {
      if (!this.muted && !this.backgroundMuted) Howler.mute(false);
      if (themeId) this.playMusic(themeId);
    }
  }

  playMenuMusic(): void {
    this.music.playMenuMusic(this.muted);
  }

  stopMenuMusic(): void {
    this.music.stopMenuMusic();
  }

  playMusic(themeId: string): void {
    this.music.playMusic(themeId, this.muted, this.initialized, () => this.init());
  }

  stopMusic(): void {
    this.music.stopMusic();
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
