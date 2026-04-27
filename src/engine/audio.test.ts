/**
 * Audio system unit tests.
 *
 * Strategy: mock howler so no real audio plays. The AudioManager singleton
 * is imported after mocks are in place. We call destroy() in afterEach to
 * reset the initialized flag between tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Track Howl instances — must use globalThis so the mock factory can access it
// before module-level const declarations are initialized.
(globalThis as any).__howlInstances ??= [];

vi.mock('howler', () => {
  const instances: any[] = (globalThis as any).__howlInstances ??= [];
  function MockHowl(this: any) {
    this.play = vi.fn();
    this.stop = vi.fn();
    this.volume = vi.fn().mockReturnValue(0.5);
    this.unload = vi.fn();
    this.playing = vi.fn().mockReturnValue(false);
    this.on = vi.fn();
    this.once = vi.fn();
    this.load = vi.fn();
    this._src = arguments[0]?.src;
    // Capture onload/onloaderror callbacks so tests can fire them deterministically
    // (instead of waiting for an actual MP3 fetch + decode that doesn't run in JSDOM).
    this._onload = arguments[0]?.onload;
    this._onloaderror = arguments[0]?.onloaderror;
    instances.push(this);
  }
  return {
    Howl: MockHowl,
    Howler: { mute: vi.fn() },
  };
});

vi.mock('./arenas/registry', () => ({
  getArenaPack: vi.fn().mockReturnValue({ musicFile: 'test-arena.mp3' }),
}));

// Mock character registry — provide packs with createSound for animal sound registration
vi.mock('./characters/registry', () => {
  const instances: any[] = (globalThis as any).__howlInstances ??= [];
  const animals = ['Bunny', 'Fox', 'Frog', 'Bear', 'Owl', 'Cat', 'Wolf', 'Panda',
    'Pig', 'Cow', 'Goat', 'Horse', 'Sheep', 'Monkey', 'Tiger', 'Rhino', 'Hedgehog'];
  return {
    listCharacterPacks: () => animals.map(name => ({
      name,
      createSound: () => {
        const h: any = {
          play: vi.fn(),
          stop: vi.fn(),
          volume: vi.fn().mockReturnValue(0.5),
          unload: vi.fn(),
          playing: vi.fn().mockReturnValue(false),
        };
        instances.push(h);
        return h;
      },
    })),
  };
});

import { audio, floatBufferToWavDataUri } from './audio';
import { Howler } from 'howler';

function getInstances(): any[] {
  return (globalThis as any).__howlInstances;
}

beforeEach(() => {
  // Clear tracked instances
  getInstances().length = 0;
  (Howler.mute as ReturnType<typeof vi.fn>).mockClear();
  // Reset singleton private state that destroy() doesn't clear
  (audio as any).muted = false;
  (audio as any).backgroundMuted = false;
  (audio as any).gamePaused = false;
  (audio as any).music.musicDisabled = false;
  (audio as any).music.muted = false;
  // Restore document.hidden to default
  Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
});

afterEach(() => {
  audio.destroy();
});

describe('AudioManager', () => {
  describe('init()', () => {
    it('is idempotent — second call registers no new sounds', () => {
      audio.init();
      const countAfterFirst = getInstances().length;
      audio.init();
      expect(getInstances().length).toBe(countAfterFirst);
    });

    it('registers all standard sound names', () => {
      audio.init();
      const expectedSounds = ['jump', 'stomp', 'victory', 'select', 'thornhit', 'crunch',
        'bunny', 'fox', 'frog', 'bear', 'owl', 'cat', 'wolf', 'panda',
        'pig', 'cow', 'goat', 'horse', 'sheep', 'monkey', 'tiger', 'rhino', 'hedgehog',
        'footstep_grass', 'footstep_wood', 'countdown_beep', 'countdown_go',
        'oof', 'splash', 'ambient', 'crowd', 'geyser', 'pigeon_scatter',
        'zero_g', 'waterfall_ambient', 'land', 'headbonk', 'bump', 'spring',
        'crouch', 'fastfall', 'amb_wind', 'amb_lava',
        'amb_space_hum', 'amb_bird_chirp', 'amb_ghost_hoo', 'amb_volcano_burst'];
      for (const name of expectedSounds) {
        expect(audio.hasSound(name), `should have sound: ${name}`).toBe(true);
      }
    });
  });

  describe('play()', () => {
    it('plays a registered sound when not muted', () => {
      audio.init();
      audio.play('jump');
      const anyPlayed = getInstances().some((h: any) => h.play.mock.calls.length > 0);
      expect(anyPlayed).toBe(true);
    });

    it('does not play when muted', () => {
      audio.init();
      audio.toggleMute();
      for (const h of getInstances()) h.play.mockClear();
      audio.play('jump');
      const anyPlayed = getInstances().some((h: any) => h.play.mock.calls.length > 0);
      expect(anyPlayed).toBe(false);
    });

    it('auto-initializes if not yet initialized', () => {
      // After destroy in afterEach, hasSound returns false
      // But play() auto-inits
      audio.destroy();
      expect(audio.hasSound('jump')).toBe(false);
      audio.play('jump');
      expect(audio.hasSound('jump')).toBe(true);
    });
  });

  describe('stop()', () => {
    it('stops a registered sound by name', () => {
      audio.init();
      audio.stop('jump');
      const anyStopped = getInstances().some((h: any) => h.stop.mock.calls.length > 0);
      expect(anyStopped).toBe(true);
    });

    it('is a no-op for unregistered name', () => {
      audio.init();
      expect(() => audio.stop('nonexistent_sound')).not.toThrow();
    });
  });

  describe('stopAllGameSounds()', () => {
    it('stops all registered sounds', () => {
      audio.init();
      audio.stopAllGameSounds();
      // At least some instances should have stop called
      const stoppedCount = getInstances().filter((h: any) => h.stop.mock.calls.length > 0).length;
      expect(stoppedCount).toBeGreaterThan(0);
    });
  });

  describe('toggleMute() / isMuted()', () => {
    it('toggles muted state and returns new value', () => {
      audio.init(); // ensure initialized first
      expect(audio.isMuted()).toBe(false);
      const result1 = audio.toggleMute();
      expect(result1).toBe(true);
      expect(audio.isMuted()).toBe(true);
      const result2 = audio.toggleMute();
      expect(result2).toBe(false);
      expect(audio.isMuted()).toBe(false);
    });

    it('stops all sounds when muting', () => {
      audio.init();
      for (const h of getInstances()) h.stop.mockClear();
      audio.toggleMute();
      const stoppedCount = getInstances().filter((h: any) => h.stop.mock.calls.length > 0).length;
      expect(stoppedCount).toBeGreaterThan(0);
    });
  });

  describe('setVolume()', () => {
    it('sets volume on a registered sound', () => {
      audio.init();
      audio.setVolume('jump', 0.5);
      const anyVolumeSet = getInstances().some((h: any) =>
        h.volume.mock.calls.some((c: number[]) => c[0] === 0.5));
      expect(anyVolumeSet).toBe(true);
    });

    it('no-op for unregistered sound name', () => {
      audio.init();
      expect(() => audio.setVolume('nonexistent', 0.5)).not.toThrow();
    });
  });

  describe('playAnimal()', () => {
    it('plays lowercase character name as sound', () => {
      audio.init();
      for (const h of getInstances()) h.play.mockClear();
      audio.playAnimal('Bunny');
      const anyPlayed = getInstances().some((h: any) => h.play.mock.calls.length > 0);
      expect(anyPlayed).toBe(true);
    });

    it('no-op for unknown character name', () => {
      audio.init();
      for (const h of getInstances()) h.play.mockClear();
      audio.playAnimal('Dragon');
      const anyPlayed = getInstances().some((h: any) => h.play.mock.calls.length > 0);
      expect(anyPlayed).toBe(false);
    });
  });

  describe('registerSound() / hasSound()', () => {
    it('registers external sound and makes it playable', () => {
      const mockHowl = { play: vi.fn(), stop: vi.fn(), volume: vi.fn(), unload: vi.fn(), playing: vi.fn() } as any;
      audio.registerSound('custom_test', mockHowl);
      expect(audio.hasSound('custom_test')).toBe(true);
    });
  });

  describe('Music lifecycle', () => {
    it('playMusic stops menu music', () => {
      audio.init();
      audio.playMenuMusic();
      // Capture which instances have play called (the menu music Howl)
      const menuPlayed = getInstances().filter((h: any) => h.play.mock.calls.length > 0);
      expect(menuPlayed.length).toBeGreaterThan(0);
      // Now play arena music — stopMenuMusic should be called
      for (const h of getInstances()) h.stop.mockClear();
      audio.playMusic('meadow');
      // At least the menu music howl should have been stopped
      const anyStopped = getInstances().some((h: any) => h.stop.mock.calls.length > 0);
      expect(anyStopped).toBe(true);
    });

    it('playMusic reuses existing Howl for same themeId', () => {
      audio.init();
      audio.playMusic('meadow');
      const countAfterFirst = getInstances().length;
      audio.playMusic('meadow');
      expect(getInstances().length).toBe(countAfterFirst);
    });

    it('playMusic does not play when muted', () => {
      audio.init();
      audio.toggleMute();
      const countBefore = getInstances().length;
      audio.playMusic('meadow');
      // No new Howl created for muted music
      expect(getInstances().length).toBe(countBefore);
    });

    it('playMusic does not play when musicDisabled', () => {
      audio.init();
      audio.setMusicDisabled(true);
      const countBefore = getInstances().length;
      audio.playMusic('meadow');
      expect(getInstances().length).toBe(countBefore);
    });

    it('stopMusic stops arena music', () => {
      audio.init();
      audio.playMusic('meadow');
      // The last created instance is the arena music Howl
      const arenaHowl = getInstances()[getInstances().length - 1];
      arenaHowl.stop.mockClear();
      audio.stopMusic();
      expect(arenaHowl.stop).toHaveBeenCalled();
    });

    it('playMusic during in-flight preload does NOT orphan the playing Howl', async () => {
      // Race: preloadArena starts (slow network). playMusic fires before
      // preload completes. The preload's onload would otherwise commit the
      // preloaded Howl over the playing one — the playing Howl becomes
      // orphaned (loop:true keeps it audible forever) and a later
      // setPaused(false, themeId) starts the preloaded Howl on top.
      audio.init();
      // Snapshot the howl-instance count BEFORE the preload — the menu Howl
      // and any sound Howls have already been created.
      const baseline = getInstances().length;

      const preloadPromise = audio.preloadArena('meadow');
      const preloadHowl = getInstances()[baseline]; // first new Howl after baseline
      expect(preloadHowl).toBeTruthy();
      expect(preloadHowl._onload).toBeTypeOf('function');

      // playMusic fires before preload completes (no onload yet).
      audio.playMusic('meadow');
      const playHowl = getInstances()[getInstances().length - 1];
      expect(playHowl).toBeTruthy();
      expect(playHowl).not.toBe(preloadHowl);
      expect(playHowl.play).toHaveBeenCalled();

      // Now the preload's onload fires. With the fix, it must NOT clobber
      // the playing Howl — it should detect that musicHowl already holds
      // a Howl for this theme and unload its own.
      preloadHowl._onload();
      expect(preloadHowl.unload).toHaveBeenCalled();

      await preloadPromise;
      // The actively-playing Howl is the one playMusic created — verify by
      // calling stopMusic and confirming THAT one (not the preload one) is
      // the one targeted.
      playHowl.stop.mockClear();
      preloadHowl.stop.mockClear();
      audio.stopMusic();
      expect(playHowl.stop).toHaveBeenCalled();
      expect(preloadHowl.stop).not.toHaveBeenCalled();
    });

    it('playMusic plays the preloaded Howl after preload completes (no extra Howl)', () => {
      // Production flow: matchLoading.runLoadingTasks() → preloadArena → onload
      // commits → setPhase('playing') → onMusicStartRequest → playMusic.
      // playMusic must reuse the committed preload Howl, not create a new one.
      audio.init();
      const baseline = getInstances().length;
      audio.preloadArena('meadow');
      const preloadHowl = getInstances()[baseline];
      expect(preloadHowl).toBeTruthy();

      // Fire the load event to commit the Howl.
      preloadHowl._onload();

      const countAfterPreload = getInstances().length;
      audio.playMusic('meadow');

      // No new Howl created — the committed preload Howl is reused.
      expect(getInstances().length).toBe(countAfterPreload);
      // play() called on the committed preload Howl.
      expect(preloadHowl.play).toHaveBeenCalled();
    });

    it('playMusic cancels the in-flight preload tracker for the same theme', () => {
      // Defense in depth: if playMusic creates its own Howl for theme X, the
      // _inFlightPreload tracker for X must be nulled so a stranger preload
      // onload can't sneak in later (e.g. a duplicate preloadArena call that
      // resolved to the dedupe path returns the same promise but the
      // original Howl's onload still has the original closure).
      audio.init();
      audio.preloadArena('meadow');
      audio.playMusic('meadow');
      // Internal: _inFlightPreload should be null after playMusic.
      const mm = (audio as unknown as { music: { _inFlightPreload: unknown } }).music;
      expect(mm._inFlightPreload).toBeNull();
    });

    it('playMenuMusic does not play when muted', () => {
      audio.init();
      audio.toggleMute();
      for (const h of getInstances()) h.play.mockClear();
      audio.playMenuMusic();
      const anyPlayed = getInstances().some((h: any) => h.play.mock.calls.length > 0);
      expect(anyPlayed).toBe(false);
    });

    it('playMenuMusic does not play when music disabled', () => {
      audio.init();
      audio.setMusicDisabled(true);
      for (const h of getInstances()) h.play.mockClear();
      audio.playMenuMusic();
      const anyPlayed = getInstances().some((h: any) => h.play.mock.calls.length > 0);
      expect(anyPlayed).toBe(false);
    });

    it('stopMenuMusic stops menu music', () => {
      audio.init();
      audio.playMenuMusic();
      for (const h of getInstances()) h.stop.mockClear();
      audio.stopMenuMusic();
      const anyStopped = getInstances().some((h: any) => h.stop.mock.calls.length > 0);
      expect(anyStopped).toBe(true);
    });
  });

  describe('Music preference persistence', () => {
    it('setMusicDisabled persists to localStorage', () => {
      audio.setMusicDisabled(true);
      expect(localStorage.getItem('carrotroyale_music_disabled')).toBe('1');
      audio.setMusicDisabled(false);
      expect(localStorage.getItem('carrotroyale_music_disabled')).toBe('0');
    });

    it('toggleMusicDisabled toggles and returns new state', () => {
      audio.setMusicDisabled(false);
      const result = audio.toggleMusicDisabled();
      expect(result).toBe(true);
      expect(audio.isMusicDisabled()).toBe(true);
    });
  });

  describe('Three-flag mute system', () => {
    it('setPaused(true) mutes Howler', () => {
      audio.init();
      (Howler.mute as ReturnType<typeof vi.fn>).mockClear();
      audio.setPaused(true);
      expect(Howler.mute).toHaveBeenCalledWith(true);
    });

    it('setPaused(false) unmutes Howler when not muted and not background-muted', () => {
      audio.init();
      audio.setPaused(true);
      (Howler.mute as ReturnType<typeof vi.fn>).mockClear();
      audio.setPaused(false);
      expect(Howler.mute).toHaveBeenCalledWith(false);
    });

    it('setPaused(false) does NOT unmute when user-muted', () => {
      audio.init();
      audio.toggleMute();
      audio.setPaused(true);
      (Howler.mute as ReturnType<typeof vi.fn>).mockClear();
      audio.setPaused(false);
      const unmuteCalls = (Howler.mute as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: boolean[]) => c[0] === false
      );
      expect(unmuteCalls).toHaveLength(0);
    });

    it('setPaused(false, themeId) triggers playMusic', () => {
      audio.init();
      audio.setPaused(true);
      const countBefore = getInstances().length;
      audio.setPaused(false, 'meadow');
      // playMusic creates a new Howl for the arena music
      expect(getInstances().length).toBeGreaterThan(countBefore);
    });

    it('visibilitychange hidden mutes Howler', () => {
      audio.init();
      (Howler.mute as ReturnType<typeof vi.fn>).mockClear();
      Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(Howler.mute).toHaveBeenCalledWith(true);
      Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
    });

    it('visibilitychange visible unmutes when not user-muted and not paused', () => {
      audio.init();
      // First go hidden
      Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      // Then come back visible
      Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
      (Howler.mute as ReturnType<typeof vi.fn>).mockClear();
      document.dispatchEvent(new Event('visibilitychange'));
      expect(Howler.mute).toHaveBeenCalledWith(false);
    });

    it('visibilitychange visible does NOT unmute when user-muted', () => {
      audio.init();
      audio.toggleMute();
      Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
      (Howler.mute as ReturnType<typeof vi.fn>).mockClear();
      document.dispatchEvent(new Event('visibilitychange'));
      const unmuteCalls = (Howler.mute as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: boolean[]) => c[0] === false
      );
      expect(unmuteCalls).toHaveLength(0);
    });
  });

  describe('destroy()', () => {
    it('unloads all sounds and clears state', () => {
      audio.init();
      audio.destroy();
      expect(audio.hasSound('jump')).toBe(false);
    });

    it('removes visibilitychange listener', () => {
      audio.init();
      const spy = vi.spyOn(document, 'removeEventListener');
      audio.destroy();
      expect(spy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      spy.mockRestore();
    });

    it('allows re-initialization after destroy', () => {
      audio.init();
      expect(audio.hasSound('jump')).toBe(true);
      audio.destroy();
      expect(audio.hasSound('jump')).toBe(false);
      audio.init();
      expect(audio.hasSound('jump')).toBe(true);
    });
  });
});

describe('floatBufferToWavDataUri', () => {
  it('produces a valid WAV data URI prefix', () => {
    const uri = floatBufferToWavDataUri(new Float32Array([0, 0.5, -0.5]), 44100);
    expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
  });

  it('encodes correct WAV header (RIFF, WAVE)', () => {
    const uri = floatBufferToWavDataUri(new Float32Array([0, 0.5, -0.5]), 44100);
    const base64 = uri.split(',')[1];
    const binary = atob(base64);
    expect(binary.substring(0, 4)).toBe('RIFF');
    expect(binary.substring(8, 12)).toBe('WAVE');
    expect(binary.substring(12, 16)).toBe('fmt ');
    expect(binary.substring(36, 40)).toBe('data');
  });

  it('encodes correct sample rate in header', () => {
    const uri = floatBufferToWavDataUri(new Float32Array([0]), 22050);
    const base64 = uri.split(',')[1];
    const binary = atob(base64);
    const sr = binary.charCodeAt(24) | (binary.charCodeAt(25) << 8) |
               (binary.charCodeAt(26) << 16) | (binary.charCodeAt(27) << 24);
    expect(sr).toBe(22050);
  });

  it('clamps samples to [-1, 1]', () => {
    const buffer = new Float32Array([2.0, -2.0, 0.5]);
    const uri = floatBufferToWavDataUri(buffer, 44100);
    const base64 = uri.split(',')[1];
    const binary = atob(base64);
    const s0 = (binary.charCodeAt(44) | (binary.charCodeAt(45) << 8)) << 16 >> 16;
    const s1 = (binary.charCodeAt(46) | (binary.charCodeAt(47) << 8)) << 16 >> 16;
    expect(s0).toBe(32767);
    expect(s1).toBe(-32768);
  });

  it('handles empty buffer', () => {
    const uri = floatBufferToWavDataUri(new Float32Array(0), 44100);
    expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
    const base64 = uri.split(',')[1];
    const binary = atob(base64);
    expect(binary.length).toBe(44);
  });

  it('mono channel (1 channel) in header', () => {
    const uri = floatBufferToWavDataUri(new Float32Array([0.5]), 44100);
    const base64 = uri.split(',')[1];
    const binary = atob(base64);
    // Channels at byte offset 22 (little-endian uint16)
    const channels = binary.charCodeAt(22) | (binary.charCodeAt(23) << 8);
    expect(channels).toBe(1);
  });

  it('16-bit samples in header', () => {
    const uri = floatBufferToWavDataUri(new Float32Array([0.5]), 44100);
    const base64 = uri.split(',')[1];
    const binary = atob(base64);
    // Bits per sample at byte offset 34 (little-endian uint16)
    const bps = binary.charCodeAt(34) | (binary.charCodeAt(35) << 8);
    expect(bps).toBe(16);
  });

  it('data chunk size matches sample count', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1.0]);
    const uri = floatBufferToWavDataUri(samples, 44100);
    const base64 = uri.split(',')[1];
    const binary = atob(base64);
    // Data size at byte offset 40 (little-endian uint32)
    const dataSize = binary.charCodeAt(40) | (binary.charCodeAt(41) << 8) |
                     (binary.charCodeAt(42) << 16) | (binary.charCodeAt(43) << 24);
    expect(dataSize).toBe(4 * 2); // 4 samples * 2 bytes each
  });

  it('total file size = header + data', () => {
    const samples = new Float32Array(100);
    const uri = floatBufferToWavDataUri(samples, 44100);
    const base64 = uri.split(',')[1];
    const binary = atob(base64);
    expect(binary.length).toBe(44 + 100 * 2); // 44 header + 200 data bytes
  });

  it('different sample rates produce different headers', () => {
    const uri1 = floatBufferToWavDataUri(new Float32Array([0]), 44100);
    const uri2 = floatBufferToWavDataUri(new Float32Array([0]), 22050);
    expect(uri1).not.toBe(uri2);
  });
});

describe('AudioManager - edge cases', () => {
  it('stopAll stops both game sounds and menu music', () => {
    audio.init();
    audio.playMenuMusic();
    for (const h of getInstances()) h.stop.mockClear();
    (audio as any).stopAll();
    const stoppedCount = getInstances().filter((h: any) => h.stop.mock.calls.length > 0).length;
    expect(stoppedCount).toBeGreaterThan(0);
  });

  it('play after unmute works', () => {
    audio.init();
    audio.toggleMute(); // mute
    audio.toggleMute(); // unmute
    for (const h of getInstances()) h.play.mockClear();
    audio.play('jump');
    const anyPlayed = getInstances().some((h: any) => h.play.mock.calls.length > 0);
    expect(anyPlayed).toBe(true);
  });

  it('setVolume to 0 does not throw', () => {
    audio.init();
    expect(() => audio.setVolume('jump', 0)).not.toThrow();
  });

  it('destroy is idempotent', () => {
    audio.init();
    audio.destroy();
    expect(() => audio.destroy()).not.toThrow();
  });

  it('playAnimal is case-insensitive via lowercase conversion', () => {
    audio.init();
    for (const h of getInstances()) h.play.mockClear();
    audio.playAnimal('BUNNY');
    const anyPlayed = getInstances().some((h: any) => h.play.mock.calls.length > 0);
    expect(anyPlayed).toBe(true);
  });
});
