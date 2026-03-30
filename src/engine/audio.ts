import { Howl } from 'howler';

export type SoundName = 'jump' | 'stomp' | 'victory' | 'select' | 'music';

class AudioManager {
  private sounds: Map<SoundName, Howl> = new Map();
  private initialized = false;
  private muted = false;

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

    this.sounds.set('music', new Howl({
      src: [generateMusicLoop()],
      volume: 0.15,
      loop: true,
    }));

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

function generateMusicLoop(): string {
  const sampleRate = 44100;
  const bpm = 140;
  const beatsPerMeasure = 4;
  const measures = 4;
  const totalBeats = beatsPerMeasure * measures;
  const beatDuration = 60 / bpm;
  const totalDuration = totalBeats * beatDuration;
  const numSamples = Math.floor(sampleRate * totalDuration);
  const buffer = new Float32Array(numSamples);

  // Simple chiptune loop
  const bassNotes = [131, 131, 165, 165, 175, 175, 131, 131]; // C3, E3, F3, C3
  const melodyNotes = [523, 0, 659, 0, 784, 659, 523, 0, 587, 0, 659, 0, 523, 0, 440, 0];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beat = t / beatDuration;
    const currentBeat = Math.floor(beat) % totalBeats;

    // Bass (every 2 beats)
    const bassIndex = Math.floor(currentBeat / 2) % bassNotes.length;
    const bassFreq = bassNotes[bassIndex];
    const bassPhase = (t * bassFreq) % 1;
    const bass = (bassPhase < 0.5 ? 1 : -1) * 0.08;

    // Melody
    const melodyIndex = currentBeat % melodyNotes.length;
    const melodyFreq = melodyNotes[melodyIndex];
    let melody = 0;
    if (melodyFreq > 0) {
      const beatProgress = (beat - Math.floor(beat));
      const melodyEnvelope = Math.max(0, 1 - beatProgress * 1.5);
      melody = Math.sin(2 * Math.PI * melodyFreq * t) * 0.06 * melodyEnvelope;
    }

    // Hi-hat (every beat)
    const hatProgress = beat - Math.floor(beat);
    const hat = (Math.random() * 2 - 1) * 0.02 * Math.max(0, 1 - hatProgress * 8);

    buffer[i] = bass + melody + hat;
  }

  return floatBufferToWavDataUri(buffer, sampleRate);
}

function floatBufferToWavDataUri(buffer: Float32Array, sampleRate: number): string {
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

  // Convert to base64
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
