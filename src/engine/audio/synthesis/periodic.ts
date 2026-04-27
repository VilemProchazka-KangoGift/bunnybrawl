import { floatBufferToWavDataUri } from './wav';

export function generateGeyserSound(): string {
  // Bubbling boil — 90Hz low rumble + 8Hz AM-modulated low-passed noise (warm-up texture).
  const sampleRate = 44100;
  const duration = 0.7;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let lp = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const rumble = Math.sin(2 * Math.PI * 90 * t) * Math.max(0, 1 - progress * 1.2) * 0.25;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 8 * t);
    const envelope = Math.min(1, progress * 5) * Math.max(0, 1 - progress * 1.4);
    buffer[i] = (rumble + lp * am * 0.35) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generatePigeonScatterSound(): string {
  // Multiple birds — 3 staggered flaps (offsets 0, 0.12, 0.28) with 15Hz wing modulation.
  const sampleRate = 44100;
  const duration = 0.6;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  const flaps = [0.0, 0.12, 0.28];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const noise = Math.random() * 2 - 1;
    let env = 0;
    for (const f of flaps) {
      const dt = progress - f;
      if (dt > 0 && dt < 0.18) {
        env = Math.max(env, Math.sin(dt / 0.18 * Math.PI) * 0.85);
      }
    }
    const flapModulation = Math.sin(2 * Math.PI * 15 * t) * 0.4;
    buffer[i] = noise * (0.5 + flapModulation * 0.5) * env * 0.2;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateAmbBirdChirpSound(): string {
  // Sparrow — 6 rapid staccato chirps rising 2800→3400Hz.
  const sampleRate = 44100;
  const duration = 0.4;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    let sample = 0;
    for (let c = 0; c < 6; c++) {
      const start = c * 0.06;
      const end = start + 0.04;
      if (progress >= start && progress < end) {
        const np = (progress - start) / 0.04;
        const freq = 2800 + 600 * np;
        const env = Math.sin(np * Math.PI) * 0.28;
        sample = Math.sin(2 * Math.PI * freq * t) * env;
      }
    }
    buffer[i] = sample;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateAmbGhostHooSound(): string {
  // Wail — 180→100Hz descending, 5Hz vibrato, crescendo+decrescendo envelope.
  const sampleRate = 44100;
  const duration = 0.85;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const baseFreq = 180 - 80 * progress;
    const vibrato = Math.sin(2 * Math.PI * 5 * t) * 14;
    const freq = baseFreq + vibrato;
    const envelope = Math.sin(progress * Math.PI) * 0.45;
    buffer[i] = Math.sin(2 * Math.PI * freq * t) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateAmbVolcanoBurstSound(): string {
  // Cavernous vent: initial pressure release + high-passed steam +
  // dominant 55Hz sub-bass rumble with slow decay (rumble-heavy mix).
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
    const rumble = Math.sin(2 * Math.PI * 55 * t) * Math.max(0, 1 - progress * 1.0) * 0.5;
    buffer[i] = release + steam + rumble;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

