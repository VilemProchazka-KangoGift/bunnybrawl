import { Howl } from 'howler';
import { generateThemeMusic } from './music';

export type SoundName = 'jump' | 'stomp' | 'victory' | 'select' | 'thornhit' | 'crunch' | 'bunny' | 'fox' | 'frog' | 'bear' | 'owl' | 'cat' | 'wolf' | 'panda' | 'pig' | 'cow' | 'goat' | 'horse' | 'sheep' | 'monkey' | 'tiger' | 'rhino' | 'hedgehog' | 'footstep_grass' | 'footstep_wood' | 'countdown_beep' | 'countdown_go' | 'oof' | 'splash' | 'ambient' | 'crowd' |'geyser' | 'pigeon_scatter' | 'zero_g' | 'waterfall_ambient';

const AUDIO_BASE = import.meta.env.BASE_URL + 'audio/';

class AudioManager {
  private sounds: Map<SoundName, Howl> = new Map();
  private initialized = false;
  private muted = false;
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
      volume: 0.5,
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
      volume: 0.5,
    }));

    this.sounds.set('crunch', new Howl({
      src: [generateCrunchSound()],
      volume: 0.4,
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
      volume: 0.3,
    }));

    // Splash: noise burst with quick decay (0.1s)
    this.sounds.set('splash', new Howl({
      src: [generateSplashSound()],
      volume: 0.2,
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

    // Preload menu music so it's ready instantly
    this.menuMusicHowl = new Howl({
      src: [AUDIO_BASE + 'carrot-royale-main.mp3'],
      volume: 0.35,
      loop: true,
    });

    this.initialized = true;
  }

  play(name: SoundName): void {
    if (this.muted) return;
    if (!this.initialized) this.init();
    this.sounds.get(name)?.play();
  }

  stop(name: SoundName): void {
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

  setVolume(name: SoundName, vol: number): void {
    const sound = this.sounds.get(name);
    if (sound) sound.volume(vol);
  }

  playAnimal(characterName: string): void {
    const soundName = characterName.toLowerCase() as SoundName;
    this.play(soundName);
  }

  playMenuMusic(): void {
    if (this.muted) return;
    if (!this.initialized) this.init();
    if (this.menuMusicHowl && this.menuMusicHowl.playing()) return;
    this.menuMusicHowl?.play();
  }

  stopMenuMusic(): void {
    if (this.menuMusicHowl) {
      this.menuMusicHowl.stop();
    }
  }

  // MP3 overrides for arena music (theme ID → filename in public/audio/)
  private static readonly MUSIC_MP3: Record<string, string> = {
    meadow: 'meadow.mp3',
    waterfall: 'waterfall.mp3',
    space_station: 'space_station.mp3',
    rooftops: 'rooftops.mp3',
  };

  /** Start theme-specific music. Lazily generates and caches per theme. */
  playMusic(themeId: string): void {
    this.stopMenuMusic();
    if (this.muted) return;
    if (!this.initialized) this.init();
    // Already playing this theme
    if (this.musicHowl && this.musicThemeId === themeId) {
      this.musicHowl.play();
      return;
    }
    // Stop previous track
    this.stopMusic();
    // Use MP3 override if available, otherwise generate procedurally
    const mp3 = AudioManager.MUSIC_MP3[themeId];
    const src = mp3
      ? AUDIO_BASE + mp3
      : generateThemeMusic(themeId);
    this.musicHowl = new Howl({ src: [src], volume: 0.3, loop: true });
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
  const duration = 0.25;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 2) * 0.4;

    // Low thud + noise
    const thud = Math.sin(2 * Math.PI * 80 * t * (1 - progress * 0.5));
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 4) * 0.3;

    buffer[i] = (thud + noise) * envelope;
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
  const duration = 0.12;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    // Sharp attack, quick decay — two-phase envelope
    const envelope = progress < 0.1
      ? progress / 0.1  // fast ramp up
      : Math.max(0, 1 - (progress - 0.1) * 1.5);  // quick decay
    // Layered noise + low crunch tone for body
    const noise = (Math.random() * 2 - 1) * 0.6;
    const tone = Math.sin(2 * Math.PI * 300 * t) * 0.3;
    // High click transient at the start
    const click = progress < 0.05 ? Math.sin(2 * Math.PI * 2000 * t) * 0.4 : 0;
    buffer[i] = (noise + tone + click) * envelope * 0.35;
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

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
