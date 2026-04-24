import { Howl } from 'howler';
import { getArenaPack } from '../arenas/registry';

const AUDIO_BASE = import.meta.env.BASE_URL + 'audio/';

export class MusicManager {
  private musicDisabled = (() => { try { return localStorage.getItem('carrotroyale_music_disabled') === '1'; } catch { return false; } })();
  private muted = false;
  private musicHowl: Howl | null = null;
  private musicThemeId: string | null = null;
  // Tracks whether menu music has actually started playing. Mobile browsers
  // block autoplay until a user gesture; Howler's internal `.playing()` flag
  // can report true even when the browser silently rejected play(), so we
  // track real playback via Howl events instead.
  private menuMusicActuallyPlaying = false;
  // Start fetching before first user interaction (init() is heavy).
  private menuMusicHowl: Howl | null = this.musicDisabled ? null : this.createMenuHowl();

  // html5: true streams the MP3 — playback starts as bytes arrive instead of
  // waiting for a full fetch + decodeAudioData (which can stall behind the
  // procedural SFX decode batch run by registerAllSounds()).
  private createMenuHowl(): Howl {
    const howl = new Howl({
      src: [AUDIO_BASE + 'carrot-royale-main.mp3'],
      volume: 0.25,
      loop: true,
      html5: true,
    });
    const clearPlaying = () => { this.menuMusicActuallyPlaying = false; };
    howl.on('play', () => { this.menuMusicActuallyPlaying = true; });
    howl.on('stop', clearPlaying);
    howl.on('playerror', clearPlaying);
    return howl;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMusicDisabled(): boolean {
    return this.musicDisabled;
  }

  setMusicDisabled(disabled: boolean): void {
    this.musicDisabled = disabled;
    try { localStorage.setItem('carrotroyale_music_disabled', disabled ? '1' : '0'); } catch { /* restricted context */ }
    if (disabled) { this.stopMusic(); this.stopMenuMusic(); }
  }

  toggleMusicDisabled(): boolean {
    this.setMusicDisabled(!this.musicDisabled);
    return this.musicDisabled;
  }

  playMenuMusic(): void {
    if (this.muted || this.musicDisabled) return;
    if (!this.menuMusicHowl) {
      this.menuMusicHowl = this.createMenuHowl();
    }
    if (this.menuMusicActuallyPlaying) return;
    this.menuMusicHowl.play();
  }

  stopMenuMusic(): void {
    if (this.menuMusicHowl) {
      this.menuMusicHowl.stop();
    }
  }

  playMusic(themeId: string): void {
    this.stopMenuMusic();
    if (this.muted || this.musicDisabled) return;
    if (this.musicHowl && this.musicThemeId === themeId) {
      // Pause only mutes Howler globally — the arena Howl keeps running
      // silently. Calling play() again on an already-playing Howl starts
      // a second concurrent instance (offset doubling). Guard with playing().
      if (!this.musicHowl.playing()) this.musicHowl.play();
      return;
    }
    this.stopMusic();
    this.musicHowl?.unload();
    const mp3 = getArenaPack(themeId)?.musicFile;
    if (!mp3) { console.warn(`[audio] No musicFile for arena '${themeId}'`); return; }
    this.musicHowl = new Howl({ src: [AUDIO_BASE + mp3], volume: 0.22, loop: true, html5: true });
    this.musicThemeId = themeId;
    this.musicHowl.play();
  }

  stopMusic(): void {
    if (this.musicHowl) {
      this.musicHowl.stop();
    }
  }

  destroy(): void {
    if (this.menuMusicHowl) {
      this.menuMusicHowl.unload();
      this.menuMusicHowl = null;
    }
    if (this.musicHowl) {
      this.musicHowl.unload();
      this.musicHowl = null;
      this.musicThemeId = null;
    }
  }
}
