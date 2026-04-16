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

export function generateAmbDripSound(): string {
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
