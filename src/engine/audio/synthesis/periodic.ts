import { floatBufferToWavDataUri } from './wav';

export function generateGeyserSound(): string {
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

export function generatePigeonScatterSound(): string {
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

export function generateAmbBirdChirpSound(): string {
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

export function generateAmbGhostHooSound(): string {
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

export function generateAmbVolcanoBurstSound(): string {
  // Volcanic vent: initial pressure release (fast-decay noise burst) +
  // sustained high-passed steam noise + sustained 65Hz low rumble underneath.
  const sampleRate = 44100;
  const duration = 0.9;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let lp = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const release = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 12) * 0.55;
    const noise = Math.random() * 2 - 1;
    lp += 0.32 * (noise - lp);
    const steam = (noise - lp) * Math.min(1, progress * 6) * Math.max(0, 1 - progress) ** 1.2 * 0.35;
    const rumble = Math.sin(2 * Math.PI * 65 * t) * Math.max(0, 1 - progress * 1.5) * 0.32;
    buffer[i] = release + steam + rumble;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

