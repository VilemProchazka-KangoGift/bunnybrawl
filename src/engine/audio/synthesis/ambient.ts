import { floatBufferToWavDataUri } from './wav';

export function generateAmbientSound(): string {
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

export function generateWaterfallSound(): string {
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

export function generateAmbWindSound(): string {
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

export function generateAmbLavaSound(): string {
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


export function generateAmbSpaceHumSound(): string {
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
