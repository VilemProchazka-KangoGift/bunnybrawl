import { Howl } from 'howler';
import { getArenaPack } from '../arenas/registry';
import { safeStorage } from '../../storage';

const AUDIO_BASE = import.meta.env.BASE_URL + 'audio/';

const MENU_BASE_VOLUME = 0.25;
const ARENA_BASE_VOLUME = 0.22;
const LS_MUSIC_DISABLED = 'carrotroyale_music_disabled';
const LS_MUSIC_VOLUME = 'carrotroyale_music_volume';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type MusicListener = () => void;

export class MusicManager {
  private musicDisabled = safeStorage.get(LS_MUSIC_DISABLED) === '1';
  // Multiplies into per-track base volumes. Persisted, default 1.0.
  private musicVolumeScalar = (() => {
    const raw = safeStorage.get(LS_MUSIC_VOLUME);
    if (raw === null) return 1;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? clamp01(n) : 1;
  })();
  private listeners: Set<MusicListener> = new Set();
  private inFlightPreloadHowl: Howl | null = null;
  private muted = false;
  private musicHowl: Howl | null = null;
  private musicThemeId: string | null = null;
  // Dedupe concurrent preloads. musicHowl/musicThemeId are only set on the
  // `load` event, so without this track, two rapid preloadArena(same theme)
  // calls would both start a fresh Howl fetch. If the themeId differs, we
  // abandon the in-flight load (its onload/onloaderror still runs but may be
  // overwritten — see below).
  private _inFlightPreload: { themeId: string; promise: Promise<void> } | null = null;
  // Tracks whether menu music has actually started playing. Mobile browsers
  // block autoplay until a user gesture; Howler's internal `.playing()` flag
  // can report true even when the browser silently rejected play(), so we
  // track real playback via Howl events instead.
  private menuMusicActuallyPlaying = false;
  // Tracks whether play() has been issued but the 'play' event hasn't fired
  // yet. Without this, rapid duplicate `playMenuMusic()` calls (e.g. React
  // StrictMode double-mount, Ctrl+F5 races) call Howl.play() twice during
  // load, and html5: true's Audio-element pool spawns two concurrent
  // instances when the file finally finishes loading.
  private menuMusicPlayPending = false;
  // Start fetching before first user interaction (init() is heavy).
  private menuMusicHowl: Howl | null = this.musicDisabled ? null : this.createMenuHowl();

  // html5: true streams the MP3 — playback starts as bytes arrive instead of
  // waiting for a full fetch + decodeAudioData (which can stall behind the
  // procedural SFX decode batch run by registerAllSounds()).
  private createMenuHowl(): Howl {
    const howl = new Howl({
      src: [AUDIO_BASE + 'carrot-royale-main.mp3'],
      volume: MENU_BASE_VOLUME * this.musicVolumeScalar,
      loop: true,
      html5: true,
    });
    const clearPlaying = () => {
      this.menuMusicActuallyPlaying = false;
      this.menuMusicPlayPending = false;
    };
    howl.on('play', () => {
      this.menuMusicActuallyPlaying = true;
      this.menuMusicPlayPending = false;
    });
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
    if (this.musicDisabled === disabled) return;
    this.musicDisabled = disabled;
    safeStorage.set(LS_MUSIC_DISABLED, disabled ? '1' : '0');
    if (disabled) { this.stopMusic(); this.stopMenuMusic(); }
    this.notify();
  }

  toggleMusicDisabled(): boolean {
    this.setMusicDisabled(!this.musicDisabled);
    return this.musicDisabled;
  }

  getMusicVolume(): number {
    return this.musicVolumeScalar;
  }

  setMusicVolume(v: number): void {
    const clamped = clamp01(v);
    if (clamped === this.musicVolumeScalar) return;
    this.musicVolumeScalar = clamped;
    safeStorage.set(LS_MUSIC_VOLUME, String(clamped));
    this.menuMusicHowl?.volume(MENU_BASE_VOLUME * clamped);
    this.musicHowl?.volume(ARENA_BASE_VOLUME * clamped);
    this.inFlightPreloadHowl?.volume(ARENA_BASE_VOLUME * clamped);
    this.notify();
  }

  subscribe(listener: MusicListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  playMenuMusic(): void {
    if (this.muted || this.musicDisabled) return;
    if (!this.menuMusicHowl) {
      this.menuMusicHowl = this.createMenuHowl();
    }
    if (this.menuMusicActuallyPlaying || this.menuMusicPlayPending) return;
    this.menuMusicPlayPending = true;
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
    // Cancel any in-flight preload for this theme so its late onload doesn't
    // clobber the fresh Howl we're about to create — that would orphan the
    // playing instance into a permanent background loop.
    if (this._inFlightPreload?.themeId === themeId) this._inFlightPreload = null;
    const mp3 = getArenaPack(themeId)?.musicFile;
    if (!mp3) { console.warn(`[audio] No musicFile for arena '${themeId}'`); return; }
    this.musicHowl = new Howl({ src: [AUDIO_BASE + mp3], volume: ARENA_BASE_VOLUME * this.musicVolumeScalar, loop: true, html5: true });
    this.musicThemeId = themeId;
    this.musicHowl.play();
  }

  /**
   * Preload the arena music so a later `playMusic(themeId)` can start without
   * fetch+decode latency. Resolves on load success or error (never rejects —
   * a failed preload must not block the loading screen).
   */
  preloadArena(themeId: string): Promise<void> {
    if (this.musicDisabled) return Promise.resolve();
    if (this.musicHowl && this.musicThemeId === themeId) return Promise.resolve();
    // Dedup concurrent calls for the same theme
    if (this._inFlightPreload && this._inFlightPreload.themeId === themeId) {
      return this._inFlightPreload.promise;
    }
    const mp3 = getArenaPack(themeId)?.musicFile;
    if (!mp3) return Promise.resolve();
    const promise = new Promise<void>((resolve) => {
      this.musicHowl?.unload();
      const clearInFlight = () => {
        if (this.inFlightPreloadHowl === howl) this.inFlightPreloadHowl = null;
      };
      const howl = new Howl({
        src: [AUDIO_BASE + mp3],
        volume: ARENA_BASE_VOLUME * this.musicVolumeScalar,
        loop: true,
        html5: true,
        onload: () => {
          // Only commit this Howl if we're still the most-recent preload.
          // A later preloadArena(differentTheme) will have overwritten
          // _inFlightPreload; in that case the older load completes into
          // a nowhere. Also: if playMusic(themeId) raced ahead of us and
          // already created+started its own Howl, do NOT clobber it
          // (would orphan the playing Howl into permanent background loop).
          if (this._inFlightPreload?.themeId === themeId) {
            const playMusicAlreadyTook = this.musicHowl !== null && this.musicThemeId === themeId;
            if (playMusicAlreadyTook) {
              howl.unload();
            } else {
              this.musicHowl = howl;
              this.musicThemeId = themeId;
            }
            this._inFlightPreload = null;
          } else {
            howl.unload();
          }
          clearInFlight();
          resolve();
        },
        onloaderror: () => {
          if (this._inFlightPreload?.themeId === themeId) {
            this.musicHowl = null;
            this.musicThemeId = null;
            this._inFlightPreload = null;
          }
          clearInFlight();
          resolve();
        },
      });
      this.inFlightPreloadHowl = howl;
      howl.load();
    });
    this._inFlightPreload = { themeId, promise };
    return promise;
  }

  /** Returns true when the preloaded music Howl matches the given themeId.
   *  Used by the loading screen to verify the right arena was actually
   *  preloaded before flipping phase to 'playing'. */
  hasPreloadedArena(themeId: string): boolean {
    return this.musicHowl !== null && this.musicThemeId === themeId;
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
