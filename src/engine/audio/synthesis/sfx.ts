import { floatBufferToWavDataUri } from './wav';
import { generateToneBuffer } from './core';

export function generateJumpSound(): string {
  const sampleRate = 44100;
  const duration = 0.12;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const p = i / numSamples;
    const freq = 300 + 300 * p;
    const phase = (t * freq) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    // Soft attack + hard release in last 15% — avoids the click at the start
    const env = Math.min(1, p * 12) * Math.max(0, 1 - Math.max(0, p - 0.85) * 7);
    buffer[i] = tri * 0.3 * env;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateSelectSound(): string {
  return generateToneBuffer(440, 0.08, 'square', 0.2, 880);
}

export function generateStompSound(): string {
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

export function generateThornHitSound(): string {
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

export function generateVictorySound(): string {
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

export function generateCrunchSound(): string {
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

export function generateFootstepGrass(): string {
  const sampleRate = 44100;
  const duration = 0.035;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const progress = i / numSamples;
    const envelope = Math.max(0, 1 - progress * 3) * 0.15;
    buffer[i] = (Math.random() * 2 - 1) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateFootstepWood(): string {
  const sampleRate = 44100;
  const duration = 0.07;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    // Warm 160Hz tone with steep decay
    const tone = Math.sin(2 * Math.PI * 160 * t) * Math.exp(-progress * 30) * 0.3;
    // Brief noise click for impact texture
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 18) * 0.25;
    buffer[i] = tone + noise;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateOofSound(): string {
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

export function generateSplashSound(): string {
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

export function generateLandSound(): string {
  // "Crunch" recipe: 85Hz sub-bass thud + low-pass filtered noise grit
  const sampleRate = 44100;
  const duration = 0.28;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let lp = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const thud = Math.sin(2 * Math.PI * 85 * t) * Math.max(0, 1 - progress * 3) * 0.45;
    const rawNoise = Math.random() * 2 - 1;
    lp += 0.15 * (rawNoise - lp); // muffled grit
    buffer[i] = thud + lp * Math.max(0, 1 - progress * 5) * 0.35;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateHeadbonkSound(): string {
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

export function generateBumpSound(): string {
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

export function generateSpringSound(): string {
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

export function generateCrouchSound(): string {
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

export function generateFastfallSound(): string {
  const sampleRate = 44100;
  const duration = 0.25;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    // Long descending swoosh
    const freq = 600 + (150 - 600) * progress;
    const envelope = Math.max(0, 1 - progress * 1.2) * 0.5;
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.5;
    // Rushing air noise that builds then fades
    const noiseAmt = Math.sin(progress * Math.PI) * 0.5;
    const noise = (Math.random() * 2 - 1) * noiseAmt;
    buffer[i] = (tone + noise) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}
