import { Howl } from 'howler';
import { generateThemeMusic } from './music';

export type SoundName = 'jump' | 'stomp' | 'victory' | 'select' | 'thornhit' | 'crunch' | 'bunny' | 'fox' | 'frog' | 'bear' | 'owl' | 'cat' | 'wolf' | 'panda' | 'pig' | 'cow' | 'goat' | 'horse' | 'sheep' | 'monkey' | 'tiger' | 'rhino' | 'hedgehog' | 'footstep_grass' | 'footstep_wood' | 'countdown_beep' | 'countdown_go' | 'oof' | 'splash' | 'ambient' | 'crowd' |'geyser' | 'pigeon_scatter' | 'zero_g' | 'waterfall_ambient' | 'land' | 'headbonk' | 'bump' | 'spring' | 'crouch' | 'fastfall' | 'amb_wind' | 'amb_lava' | 'amb_underwater_bubbles' | 'amb_space_hum' | 'amb_bird_chirp' | 'amb_ghost_hoo' | 'amb_volcano_burst' | 'amb_drip' | 'amb_chime';

const AUDIO_BASE = import.meta.env.BASE_URL + 'audio/';

class AudioManager {
  // Widened to string keys so external character packs can register sounds dynamically
  private sounds: Map<string, Howl> = new Map();
  private initialized = false;
  private muted = false;
  private musicDisabled = false;
  private musicHowl: Howl | null = null;
  private musicThemeId: string | null = null;
  private menuMusicHowl: Howl | null = null;

  init(): void {
    if (this.initialized) return;

    // We'll generate audio programmatically using AudioContext
    // and load them as data URIs into Howler
    this.sounds.set('jump', new Howl({
      src: [generateJumpSound()],
      volume: 0.3,
    }));

    this.sounds.set('stomp', new Howl({
      src: [generateStompSound()],
      volume: 0.6,
    }));

    this.sounds.set('victory', new Howl({
      src: [generateVictorySound()],
      volume: 0.4,
    }));

    this.sounds.set('select', new Howl({
      src: [generateSelectSound()],
      volume: 0.3,
    }));

    this.sounds.set('thornhit', new Howl({
      src: [generateThornHitSound()],
      volume: 0.8,
    }));

    this.sounds.set('crunch', new Howl({
      src: [generateCrunchSound()],
      volume: 0.6,
    }));

    // Animal sounds — simple tones
    const SIMPLE_ANIMAL_SOUNDS: Array<{ name: SoundName; freq: number; duration: number; type: OscillatorType; genVol: number; freqEnd?: number; vol?: number }> = [
      { name: 'bunny', freq: 800, duration: 0.1, type: 'square', genVol: 0.4, freqEnd: 1200 },
      { name: 'fox', freq: 600, duration: 0.15, type: 'sawtooth', genVol: 0.4, freqEnd: 400 },
      { name: 'bear', freq: 100, duration: 0.25, type: 'sawtooth', genVol: 0.4 },
      { name: 'panda', freq: 500, duration: 0.12, type: 'triangle', genVol: 0.4, freqEnd: 600 },
      { name: 'cow', freq: 150, duration: 0.4, type: 'sine', genVol: 0.4, freqEnd: 130 },
      { name: 'sheep', freq: 350, duration: 0.3, type: 'sine', genVol: 0.4, freqEnd: 250 },
    ];
    for (const s of SIMPLE_ANIMAL_SOUNDS) {
      this.sounds.set(s.name, new Howl({
        src: [generateToneBuffer(s.freq, s.duration, s.type, s.genVol, s.freqEnd)],
        volume: s.vol ?? 0.4,
      }));
    }

    // Animal sounds — multi-segment tones
    const SEGMENT_ANIMAL_SOUNDS: Array<{ name: SoundName; segments: ToneSegment[]; genVol: number; vol?: number }> = [
      { name: 'owl', segments: [
        { freq: 400, freqEnd: 300, duration: 0.15, type: 'sine' },
        { freq: 300, freqEnd: 400, duration: 0.15, type: 'sine' },
      ], genVol: 0.4 },
      { name: 'cat', segments: [
        { freq: 700, freqEnd: 500, duration: 0.1, type: 'sine' },
        { freq: 500, freqEnd: 600, duration: 0.1, type: 'sine' },
      ], genVol: 0.4 },
      { name: 'wolf', segments: [
        { freq: 300, freqEnd: 500, duration: 0.12, type: 'sawtooth' },
        { freq: 500, freqEnd: 400, duration: 0.23, type: 'sawtooth' },
      ], genVol: 0.4 },
      { name: 'pig', segments: [
        { freq: 250, freqEnd: 350, duration: 0.07, type: 'square' },
        { freq: 350, freqEnd: 200, duration: 0.13, type: 'square' },
      ], genVol: 0.4 },
      { name: 'goat', segments: [
        { freq: 400, freqEnd: 300, duration: 0.1, type: 'sawtooth' },
        { freq: 300, freqEnd: 350, duration: 0.15, type: 'sawtooth' },
      ], genVol: 0.4 },
      { name: 'horse', segments: [
        { freq: 500, freqEnd: 800, duration: 0.1, type: 'sawtooth' },
        { freq: 800, freqEnd: 400, duration: 0.2, type: 'sawtooth' },
      ], genVol: 0.4 },
      { name: 'monkey', segments: [
        { freq: 800, freqEnd: 1200, duration: 0.07, type: 'square' },
        { freq: 1200, freqEnd: 600, duration: 0.13, type: 'square' },
      ], genVol: 0.4 },
      { name: 'tiger', segments: [
        { freq: 200, freqEnd: 120, duration: 0.2, type: 'sawtooth' },
        { freq: 120, freqEnd: 80, duration: 0.15, type: 'sawtooth' },
      ], genVol: 0.5, vol: 0.45 },
      { name: 'rhino', segments: [
        { freq: 100, freqEnd: 60, duration: 0.15, type: 'square' },
        { freq: 60, freqEnd: 90, duration: 0.2, type: 'sine' },
      ], genVol: 0.5, vol: 0.45 },
      { name: 'hedgehog', segments: [
        { freq: 600, freqEnd: 800, duration: 0.06, type: 'triangle' },
        { freq: 800, freqEnd: 500, duration: 0.1, type: 'triangle' },
      ], genVol: 0.4 },
    ];
    for (const s of SEGMENT_ANIMAL_SOUNDS) {
      this.sounds.set(s.name, new Howl({
        src: [generateMultiSegmentTone(s.segments, s.genVol)],
        volume: s.vol ?? 0.4,
      }));
    }

    // Frog uses a custom generator
    this.sounds.set('frog', new Howl({
      src: [generateFrogRibbit()],
      volume: 0.4,
    }));

    // Footstep grass: very short soft crunch
    this.sounds.set('footstep_grass', new Howl({
      src: [generateFootstepGrass()],
      volume: 0.15,
    }));

    // Footstep wood: short higher-pitched tap
    this.sounds.set('footstep_wood', new Howl({
      src: [generateFootstepWood()],
      volume: 0.15,
    }));

    // Countdown beep: clean 440Hz sine, 0.15s
    this.sounds.set('countdown_beep', new Howl({
      src: [generateToneBuffer(440, 0.15, 'sine', 0.4)],
      volume: 0.4,
    }));

    // Countdown go: higher 880Hz sine, 0.2s
    this.sounds.set('countdown_go', new Howl({
      src: [generateToneBuffer(880, 0.2, 'sine', 0.5)],
      volume: 0.5,
    }));

    // Oof: low impact (150Hz->100Hz, 0.15s, noise burst)
    this.sounds.set('oof', new Howl({
      src: [generateOofSound()],
      volume: 0.6,
    }));

    // Splash: noise burst with quick decay (0.1s)
    this.sounds.set('splash', new Howl({
      src: [generateSplashSound()],
      volume: 0.5,
    }));

    // Ambient: 2-second loop of quiet brownian noise
    this.sounds.set('ambient', new Howl({
      src: [generateAmbientSound()],
      volume: 0.12,
      loop: true,
    }));

    // Crowd: filtered noise burst, 0.5s, volume 0 initially
    this.sounds.set('crowd', new Howl({
      src: [generateCrowdSound()],
      volume: 0,
    }));


    this.sounds.set('geyser', new Howl({
      src: [generateGeyserSound()],
      volume: 0.3,
    }));

    this.sounds.set('pigeon_scatter', new Howl({
      src: [generatePigeonScatterSound()],
      volume: 0.25,
    }));

    this.sounds.set('zero_g', new Howl({
      src: [generateZeroGSound()],
      volume: 0.15,
      loop: true,
    }));

    this.sounds.set('waterfall_ambient', new Howl({
      src: [generateWaterfallSound()],
      volume: 0.18,
      loop: true,
    }));

    // --- New SFX ---
    this.sounds.set('land', new Howl({ src: [generateLandSound()], volume: 0.5 }));
    this.sounds.set('headbonk', new Howl({ src: [generateHeadbonkSound()], volume: 1.0 }));
    this.sounds.set('bump', new Howl({ src: [generateBumpSound()], volume: 1.0 }));
    this.sounds.set('spring', new Howl({ src: [generateSpringSound()], volume: 1.0 }));
    this.sounds.set('crouch', new Howl({ src: [generateCrouchSound()], volume: 0.7 }));
    this.sounds.set('fastfall', new Howl({ src: [generateFastfallSound()], volume: 0.9 }));

    // --- Ambient loops ---
    this.sounds.set('amb_wind', new Howl({ src: [generateAmbWindSound()], volume: 0.55, loop: true }));
    this.sounds.set('amb_lava', new Howl({ src: [generateAmbLavaSound()], volume: 0.6, loop: true }));
    this.sounds.set('amb_underwater_bubbles', new Howl({ src: [generateAmbUnderwaterBubblesSound()], volume: 0.55, loop: true }));
    this.sounds.set('amb_space_hum', new Howl({ src: [generateAmbSpaceHumSound()], volume: 0.55, loop: true }));

    // --- Ambient periodic one-shots ---
    this.sounds.set('amb_bird_chirp', new Howl({ src: [generateAmbBirdChirpSound()], volume: 0.5 }));
    this.sounds.set('amb_ghost_hoo', new Howl({ src: [generateAmbGhostHooSound()], volume: 0.65 }));
    this.sounds.set('amb_volcano_burst', new Howl({ src: [generateAmbVolcanoBurstSound()], volume: 0.8 }));
    this.sounds.set('amb_drip', new Howl({ src: [generateAmbDripSound()], volume: 0.55 }));
    this.sounds.set('amb_chime', new Howl({ src: [generateAmbChimeSound()], volume: 0.5 }));

    // Preload menu music so it's ready instantly
    this.menuMusicHowl = new Howl({
      src: [AUDIO_BASE + 'carrot-royale-main.mp3'],
      volume: 0.25,
      loop: true,
    });

    this.initialized = true;
  }

  play(name: SoundName | string): void {
    if (this.muted) return;
    if (!this.initialized) this.init();
    this.sounds.get(name)?.play();
  }

  stop(name: SoundName | string): void {
    this.sounds.get(name)?.stop();
  }

  stopAll(): void {
    for (const sound of this.sounds.values()) {
      sound.stop();
    }
    this.stopMusic();
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

  setMusicDisabled(disabled: boolean): void {
    this.musicDisabled = disabled;
    if (disabled) { this.stopMusic(); this.stopMenuMusic(); }
  }

  playMenuMusic(): void {
    if (this.muted || this.musicDisabled) return;
    if (!this.initialized) this.init();
    if (this.menuMusicHowl && this.menuMusicHowl.playing()) return;
    this.menuMusicHowl?.play();
  }

  stopMenuMusic(): void {
    if (this.menuMusicHowl) {
      this.menuMusicHowl.stop();
    }
  }

  /** Start theme-specific music. If mp3File is provided (from ArenaPack.musicFile),
   *  uses that directly. Otherwise falls back to procedural generation. */
  playMusic(themeId: string, mp3File?: string): void {
    this.stopMenuMusic();
    if (this.muted || this.musicDisabled) return;
    if (!this.initialized) this.init();
    // Already playing this theme
    if (this.musicHowl && this.musicThemeId === themeId) {
      this.musicHowl.play();
      return;
    }
    // Stop previous track
    this.stopMusic();
    const src = mp3File
      ? AUDIO_BASE + mp3File
      : generateThemeMusic(themeId);
    this.musicHowl = new Howl({ src: [src], volume: 0.22, loop: true });
    this.musicThemeId = themeId;
    this.musicHowl.play();
  }

  stopMusic(): void {
    if (this.musicHowl) {
      this.musicHowl.stop();
    }
  }

  destroy(): void {
    for (const sound of this.sounds.values()) {
      sound.unload();
    }
    this.sounds.clear();
    if (this.menuMusicHowl) {
      this.menuMusicHowl.unload();
      this.menuMusicHowl = null;
    }
    if (this.musicHowl) {
      this.musicHowl.unload();
      this.musicHowl = null;
      this.musicThemeId = null;
    }
    this.initialized = false;
  }
}

// Singleton
export const audio = new AudioManager();

// --- Procedural audio generation using Web Audio API ---

function generateToneBuffer(
  frequency: number,
  duration: number,
  type: OscillatorType = 'square',
  volume = 0.3,
  frequencyEnd?: number,
): string {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const freq = frequencyEnd ? frequency + (frequencyEnd - frequency) * progress : frequency;
    const envelope = Math.max(0, 1 - progress) * volume;

    let sample: number;
    const phase = (t * freq) % 1;
    switch (type) {
      case 'square':
        sample = phase < 0.5 ? 1 : -1;
        break;
      case 'sawtooth':
        sample = 2 * phase - 1;
        break;
      case 'triangle':
        sample = 4 * Math.abs(phase - 0.5) - 1;
        break;
      default:
        sample = Math.sin(2 * Math.PI * freq * t);
    }

    buffer[i] = sample * envelope;
  }

  return floatBufferToWavDataUri(buffer, sampleRate);
}

interface ToneSegment {
  freq: number;
  freqEnd?: number;
  duration: number;
  type: OscillatorType;
}

function generateMultiSegmentTone(segments: ToneSegment[], volume = 0.3): string {
  const sampleRate = 44100;
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const totalSamples = Math.floor(sampleRate * totalDuration);
  const buffer = new Float32Array(totalSamples);

  let offset = 0;
  for (const seg of segments) {
    const numSamples = Math.floor(sampleRate * seg.duration);
    for (let i = 0; i < numSamples && offset + i < totalSamples; i++) {
      const t = i / sampleRate;
      const progress = i / numSamples;
      const globalProgress = (offset + i) / totalSamples;
      const freq = seg.freqEnd ? seg.freq + (seg.freqEnd - seg.freq) * progress : seg.freq;
      const envelope = Math.max(0, 1 - globalProgress) * volume;

      let sample: number;
      const phase = (t * freq) % 1;
      switch (seg.type) {
        case 'square':
          sample = phase < 0.5 ? 1 : -1;
          break;
        case 'sawtooth':
          sample = 2 * phase - 1;
          break;
        case 'triangle':
          sample = 4 * Math.abs(phase - 0.5) - 1;
          break;
        default:
          sample = Math.sin(2 * Math.PI * freq * t);
      }

      buffer[offset + i] = sample * envelope;
    }
    offset += numSamples;
  }

  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateFrogRibbit(): string {
  const sampleRate = 44100;
  const duration = 0.2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const freq = 200 + (150 - 200) * progress;
    // Wobble effect
    const wobble = Math.sin(2 * Math.PI * 30 * t) * 20;
    const actualFreq = freq + wobble;
    const envelope = Math.max(0, 1 - progress) * 0.4;
    const phase = (t * actualFreq) % 1;
    const sample = phase < 0.5 ? 1 : -1; // square wave
    buffer[i] = sample * envelope;
  }

  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateJumpSound(): string {
  return generateToneBuffer(300, 0.12, 'square', 0.25, 600);
}

function generateStompSound(): string {
  const sampleRate = 44100;
  const duration = 0.3;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;

    // Sharp crack at the start (high freq, fast decay)
    const crack = Math.sin(2 * Math.PI * 800 * t) * Math.max(0, 1 - progress * 12) * 0.4;
    // Heavy thud (descending frequency for weight)
    const thudFreq = 120 * (1 - progress * 0.6);
    const thud = Math.sin(2 * Math.PI * thudFreq * t) * Math.max(0, 1 - progress * 2) * 0.5;
    // Noise burst for impact texture
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 5) * 0.35;

    buffer[i] = crack + thud + noise;
  }

  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateThornHitSound(): string {
  // Painful prick: sharp high attack + descending crunch + noise burst
  const sampleRate = 44100;
  const duration = 0.3;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;

    // Sharp initial stab (high freq, fast decay)
    const stab = Math.sin(2 * Math.PI * 1200 * t) * Math.max(0, 1 - progress * 8) * 0.35;
    // Descending pain tone
    const painFreq = 600 - progress * 400;
    const pain = Math.sin(2 * Math.PI * painFreq * t) * Math.max(0, 1 - progress * 3) * 0.2;
    // Crackle noise
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 5) * 0.15;

    buffer[i] = stab + pain + noise;
  }

  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateVictorySound(): string {
  const sampleRate = 44100;
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  const noteDuration = 0.15;
  const totalSamples = Math.floor(sampleRate * notes.length * noteDuration);
  const buffer = new Float32Array(totalSamples);

  for (let n = 0; n < notes.length; n++) {
    const startSample = Math.floor(n * noteDuration * sampleRate);
    const endSample = Math.floor((n + 1) * noteDuration * sampleRate);
    for (let i = startSample; i < endSample && i < totalSamples; i++) {
      const t = (i - startSample) / sampleRate;
      const progress = (i - startSample) / (endSample - startSample);
      const envelope = Math.max(0, 1 - progress) * 0.3;
      buffer[i] = Math.sin(2 * Math.PI * notes[n] * t) * envelope;
    }
  }

  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateSelectSound(): string {
  return generateToneBuffer(440, 0.08, 'square', 0.2, 880);
}


function generateFootstepGrass(): string {
  const sampleRate = 44100;
  const duration = 0.05;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 3) * 0.15;
    buffer[i] = (Math.random() * 2 - 1) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateFootstepWood(): string {
  const sampleRate = 44100;
  const duration = 0.05;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 3) * 0.15;
    const tone = Math.sin(2 * Math.PI * 1200 * t);
    buffer[i] = tone * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateCrunchSound(): string {
  const sampleRate = 44100;
  const duration = 0.15;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    // Two-phase envelope: sharp attack, moderate decay
    const envelope = progress < 0.08
      ? progress / 0.08
      : Math.max(0, 1 - (progress - 0.08) * 1.2);
    // Loud crackly noise (the crunch)
    const noise = (Math.random() * 2 - 1) * 0.7;
    // Multiple crunch harmonics for texture
    const crunch1 = Math.sin(2 * Math.PI * 400 * t) * 0.3;
    const crunch2 = Math.sin(2 * Math.PI * 900 * t) * 0.15 * Math.max(0, 1 - progress * 3);
    // Sharp snap at the start
    const snap = progress < 0.06 ? Math.sin(2 * Math.PI * 2500 * t) * 0.5 : 0;
    buffer[i] = (noise + crunch1 + crunch2 + snap) * envelope * 0.45;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateOofSound(): string {
  const sampleRate = 44100;
  const duration = 0.15;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const freq = 150 + (100 - 150) * progress;
    const envelope = Math.max(0, 1 - progress * 2) * 0.3;
    const tone = Math.sin(2 * Math.PI * freq * t);
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 5) * 0.2;
    buffer[i] = (tone + noise) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateSplashSound(): string {
  const sampleRate = 44100;
  const duration = 0.1;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 4) * 0.2;
    buffer[i] = (Math.random() * 2 - 1) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateAmbientSound(): string {
  const sampleRate = 44100;
  const duration = 2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let brown = 0;
  for (let i = 0; i < numSamples; i++) {
    const white = Math.random() * 2 - 1;
    brown += white * 0.02;
    brown = Math.max(-1, Math.min(1, brown));
    buffer[i] = brown * 0.05;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateCrowdSound(): string {
  const sampleRate = 44100;
  const duration = 0.5;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 1.5);
    // Filtered noise: mix of low-frequency modulated noise
    const mod = Math.sin(2 * Math.PI * 8 * t) * 0.5 + 0.5;
    buffer[i] = (Math.random() * 2 - 1) * envelope * mod * 0.3;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function floatBufferToWavDataUri(buffer: Float32Array, sampleRate: number): string {
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write samples
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, buffer[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(headerSize + i * bytesPerSample, intSample, true);
  }

  // Convert to base64 (chunked to avoid O(n²) string concatenation)
  const bytes = new Uint8Array(arrayBuffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192))));
  }
  return 'data:audio/wav;base64,' + btoa(chunks.join(''));
}


function generateGeyserSound(): string {
  const sampleRate = 44100;
  const duration = 0.6;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 1.5) * (progress < 0.1 ? progress * 10 : 1);
    // Bubble-like rising tone
    const freq = 200 + progress * 400;
    const bubble = Math.sin(2 * Math.PI * freq * t) * 0.3;
    const noise = (Math.random() * 2 - 1) * 0.15;
    buffer[i] = (bubble + noise) * envelope * 0.3;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateZeroGSound(): string {
  const sampleRate = 44100;
  const duration = 2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Deep electronic hum with slight modulation
    const hum = Math.sin(2 * Math.PI * 80 * t) * 0.08;
    const mod = Math.sin(2 * Math.PI * 0.5 * t) * 0.3 + 0.7;
    const high = Math.sin(2 * Math.PI * 220 * t + Math.sin(2 * Math.PI * 0.3 * t) * 3) * 0.02;
    buffer[i] = (hum * mod + high) * 0.4;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateWaterfallSound(): string {
  const sampleRate = 44100;
  const duration = 3;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  // Brownian noise for the low rumble, band-limited white noise for the rushing water
  let brown = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const white = Math.random() * 2 - 1;
    // Brownian component — deep rumble
    brown += white * 0.015;
    brown *= 0.998; // slow decay to prevent drift
    brown = Math.max(-1, Math.min(1, brown));
    // Filtered noise — rushing water (mid-high frequencies)
    const rush = white * 0.12;
    // Slow modulation for natural ebb and flow
    const mod = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.25 * t);
    // Gentle low tone for depth
    const tone = Math.sin(2 * Math.PI * 55 * t) * 0.015;
    buffer[i] = (brown * 0.08 + rush * mod + tone) * 0.35;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generatePigeonScatterSound(): string {
  const sampleRate = 44100;
  const duration = 0.4;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 2) * (progress < 0.05 ? progress * 20 : 1);
    // Wing flapping noise
    const flap = Math.sin(2 * Math.PI * 30 * progress * 8) * 0.3;
    const noise = (Math.random() * 2 - 1) * 0.4;
    buffer[i] = (noise * (0.5 + flap * 0.5)) * envelope * 0.2;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

// --- New SFX generators ---

function generateLandSound(): string {
  const sampleRate = 44100;
  const duration = 0.1;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const freq = 150 + (80 - 150) * progress;
    const envelope = Math.max(0, 1 - progress * 2.5) * 0.5;
    const tone = Math.sin(2 * Math.PI * freq * t);
    const noise = progress < 0.3 ? (Math.random() * 2 - 1) * 0.5 : 0;
    buffer[i] = (tone + noise) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateHeadbonkSound(): string {
  const sampleRate = 44100;
  const duration = 0.15;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    // Hard knock transient
    const knock = progress < 0.1 ? Math.sin(2 * Math.PI * 1000 * t) * 0.7 : 0;
    // Hollow bonk body (descending)
    const freq = 350 + (180 - 350) * progress;
    const envelope = Math.max(0, 1 - progress * 1.8) * 0.6;
    const phase = (t * freq) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    // Noise for impact texture
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 6) * 0.25;
    buffer[i] = (tri * envelope) + knock + noise;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateBumpSound(): string {
  const sampleRate = 44100;
  const duration = 0.08;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 3) * 0.4;
    const noise = (Math.random() * 2 - 1) * 0.4;
    const tone = Math.sin(2 * Math.PI * 160 * t) * 0.3;
    buffer[i] = (noise + tone) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateSpringSound(): string {
  const sampleRate = 44100;
  const duration = 0.2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 1.5) * 0.5;
    // Wobbling frequency for "boing" effect
    const wobble = Math.sin(2 * Math.PI * 25 * t) * 200;
    const freq = 400 + wobble;
    buffer[i] = Math.sin(2 * Math.PI * freq * t) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateCrouchSound(): string {
  const sampleRate = 44100;
  const duration = 0.06;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 4) * 0.4;
    const noise = (Math.random() * 2 - 1) * 0.4;
    const thud = Math.sin(2 * Math.PI * 130 * t) * 0.3;
    buffer[i] = (noise + thud) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateFastfallSound(): string {
  const sampleRate = 44100;
  const duration = 0.25;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    // Long descending swoosh
    const freq = 800 + (150 - 800) * progress;
    const envelope = Math.max(0, 1 - progress * 1.2) * 0.5;
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.5;
    // Rushing air noise that builds then fades
    const noiseAmt = Math.sin(progress * Math.PI) * 0.5;
    const noise = (Math.random() * 2 - 1) * noiseAmt;
    buffer[i] = (tone + noise) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

// --- Ambient loop generators ---

function generateAmbWindSound(): string {
  const sampleRate = 44100;
  const duration = 3;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let brown = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const white = Math.random() * 2 - 1;
    brown += white * 0.01;
    brown *= 0.999;
    brown = Math.max(-1, Math.min(1, brown));
    const mod = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.2 * t);
    buffer[i] = brown * mod * 0.25;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateAmbLavaSound(): string {
  const sampleRate = 44100;
  const duration = 3;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let brown = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const white = Math.random() * 2 - 1;
    brown += white * 0.02;
    brown *= 0.997;
    brown = Math.max(-1, Math.min(1, brown));
    const rumble = Math.sin(2 * Math.PI * 45 * t) * 0.15;
    const mod = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.15 * t);
    buffer[i] = (brown * 0.1 + rumble) * mod * 0.5;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateAmbUnderwaterBubblesSound(): string {
  const sampleRate = 44100;
  const duration = 2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let brown = 0;
  // Pre-generate random bubble positions
  let nextBubble = Math.floor(Math.random() * 800) + 200;
  let bubbleLife = 0;
  let bubbleFreq = 400;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const white = Math.random() * 2 - 1;
    brown += white * 0.005;
    brown *= 0.999;
    brown = Math.max(-1, Math.min(1, brown));
    let bubbleSample = 0;
    if (i >= nextBubble && bubbleLife <= 0) {
      bubbleLife = 400 + Math.floor(Math.random() * 300);
      bubbleFreq = 300 + Math.random() * 500;
      nextBubble = i + Math.floor(Math.random() * 2000) + 500;
    }
    if (bubbleLife > 0) {
      const bp = 1 - bubbleLife / 700;
      const bEnv = Math.max(0, 1 - bp * 3) * 0.25;
      bubbleSample = Math.sin(2 * Math.PI * bubbleFreq * t) * bEnv;
      bubbleLife--;
    }
    buffer[i] = brown * 0.06 + bubbleSample;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateAmbSpaceHumSound(): string {
  const sampleRate = 44100;
  const duration = 2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const hum = Math.sin(2 * Math.PI * 80 * t) * 0.12;
    const mod = Math.sin(2 * Math.PI * 0.4 * t) * 0.3 + 0.7;
    const high = Math.sin(2 * Math.PI * 220 * t + Math.sin(2 * Math.PI * 0.25 * t) * 3) * 0.04;
    buffer[i] = (hum * mod + high) * 0.5;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

// --- Ambient periodic generators ---

function generateAmbBirdChirpSound(): string {
  const sampleRate = 44100;
  const duration = 0.35;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  // 3-4 quick warbling notes like a songbird
  const notes = [
    { start: 0, end: 0.06, freq: 2800, freqEnd: 3200 },
    { start: 0.08, end: 0.14, freq: 3400, freqEnd: 2600 },
    { start: 0.16, end: 0.22, freq: 3000, freqEnd: 3600 },
    { start: 0.25, end: 0.33, freq: 3200, freqEnd: 2400 },
  ];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const note of notes) {
      if (t >= note.start && t < note.end) {
        const np = (t - note.start) / (note.end - note.start);
        const freq = note.freq + (note.freqEnd - note.freq) * np;
        // Fast vibrato for warble
        const vibrato = Math.sin(2 * Math.PI * 45 * t) * freq * 0.05;
        const env = Math.sin(np * Math.PI) * 0.35;
        sample = Math.sin(2 * Math.PI * (freq + vibrato) * t) * env;
      }
    }
    buffer[i] = sample;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateAmbGhostHooSound(): string {
  const sampleRate = 44100;
  const duration = 0.6;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const baseFreq = 150 + (100 - 150) * progress;
    const vibrato = Math.sin(2 * Math.PI * 4 * t) * 15;
    const freq = baseFreq + vibrato;
    const envelope = Math.max(0, 1 - progress) * 0.4;
    buffer[i] = Math.sin(2 * Math.PI * freq * t) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateAmbVolcanoBurstSound(): string {
  const sampleRate = 44100;
  const duration = 0.5;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 1.8) * (progress < 0.15 ? progress / 0.15 : 1) * 0.5;
    const rumble = Math.sin(2 * Math.PI * 60 * t) * 0.5;
    const noise = (Math.random() * 2 - 1) * 0.5;
    buffer[i] = (rumble + noise) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateAmbDripSound(): string {
  const sampleRate = 44100;
  const duration = 0.08;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const freq = 600 + (400 - 600) * progress;
    const envelope = Math.max(0, 1 - progress * 3) * 0.4;
    const tone = Math.sin(2 * Math.PI * freq * t);
    const noise = (Math.random() * 2 - 1) * 0.1;
    buffer[i] = (tone + noise) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function generateAmbChimeSound(): string {
  const sampleRate = 44100;
  const duration = 0.3;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress) * 0.4;
    // Triangle wave fundamental + harmonic for shimmer
    const phase1 = (t * 1200) % 1;
    const tri = 4 * Math.abs(phase1 - 0.5) - 1;
    const harmonic = Math.sin(2 * Math.PI * 2400 * t) * 0.3;
    buffer[i] = (tri + harmonic) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
