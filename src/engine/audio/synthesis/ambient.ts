import { floatBufferToWavDataUri } from './wav';

export function generateCrowdSound(): string {
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

export function generateZeroGSound(): string {
  // Shimmer — thin 90Hz drone + 320Hz LFO-phase-modulated upper tone.
  const sampleRate = 44100;
  const duration = 2.0;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const drone = Math.sin(2 * Math.PI * 90 * t) * 0.06;
    const shimmer = Math.sin(2 * Math.PI * 320 * t + Math.sin(2 * Math.PI * 0.5 * t) * 6) * 0.025;
    const mod = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.4 * t);
    buffer[i] = (drone + shimmer) * mod * 0.5;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateWaterfallSound(): string {
  // Roaring (gentler) — stacked leaky integrators (slow body + fast rush) +
  // 50Hz body tone, modulated 0.22Hz.
  const sampleRate = 44100;
  const duration = 3;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let slow = 0;
  let fast = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const white = Math.random() * 2 - 1;
    slow += white * 0.02;
    slow *= 0.998;
    slow = Math.max(-1, Math.min(1, slow));
    fast += white * 0.18;
    fast *= 0.85;
    fast = Math.max(-1, Math.min(1, fast));
    const mod = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.22 * t);
    const tone = Math.sin(2 * Math.PI * 50 * t) * 0.02;
    buffer[i] = (slow * 0.05 + fast * 0.13 * mod + tone) * 0.45;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateAmbWindSound(): string {
  // Breezier (quieter) — brown noise with deeper 0.3Hz amplitude modulation.
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
    const mod = 0.4 + 0.6 * Math.sin(2 * Math.PI * 0.3 * t);
    buffer[i] = brown * mod * 0.18;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateAmbLavaSound(): string {
  // Slow-mod with low rumble — 35Hz sub-bass rumble + brown bed,
  // gently modulated at 0.08Hz.
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
    const rumble = Math.sin(2 * Math.PI * 35 * t) * 0.18;
    const mod = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.08 * t);
    buffer[i] = (brown * 0.1 + rumble) * mod * 0.5;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}


export function generateAmbSpaceHumSound(): string {
  const sampleRate = 44100;
  const duration = 2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const hum = Math.sin(2 * Math.PI * 80 * t) * 0.12;
    const mod = Math.sin(2 * Math.PI * 0.4 * t) * 0.3 + 0.7;
    const high = Math.sin(2 * Math.PI * 220 * t + Math.sin(2 * Math.PI * 0.25 * t) * 6) * 0.04;
    buffer[i] = (hum * mod + high) * 0.5;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}
