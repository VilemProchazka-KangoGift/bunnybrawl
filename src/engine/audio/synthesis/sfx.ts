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
  // Layer 1 (0–450ms): "Cartoon-splat" — burst + descending pitch sweep + wet
  // low-pass body + drips. Layer 2 (100–420ms): "OH YEAH!" voice-like layer —
  // pitch curve rises 280→380Hz over 50ms ("oh"), then falls to 220Hz over the
  // remainder ("yeah"). Square wave for cartoon character.
  const sampleRate = 44100;
  const duration = 0.55;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let lp = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // ---- Splat layer (0..0.45s) ----
    let splat = 0;
    if (t < 0.45) {
      const prog = t / 0.45;
      const burst = (Math.random() * 2 - 1) * Math.max(0, 1 - prog * 8) * 0.7;
      const sweepF = 350 + (70 - 350) * Math.min(1, prog * 2.5);
      const sweep = Math.sin(2 * Math.PI * sweepF * t) * Math.max(0, 1 - prog * 3) * 0.4;
      const noise = Math.random() * 2 - 1;
      lp += 0.16 * (noise - lp);
      const body = lp * Math.max(0, prog - 0.05) * Math.max(0, 1 - prog * 1.5) * 0.5;
      const drips = (Math.random() * 2 - 1) * Math.max(0, prog - 0.55) * Math.max(0, 1 - prog) * 0.25;
      splat = burst + sweep + body + drips;
    }
    // ---- OH YEAH layer (0.10..0.42s) ----
    let voice = 0;
    const localT = t - 0.1;
    if (localT >= 0 && localT < 0.32) {
      const f = localT < 0.05
        ? 280 + 100 * (localT / 0.05)
        : 380 + (220 - 380) * ((localT - 0.05) / 0.27);
      const phase = (t * f) % 1;
      const sq = phase < 0.5 ? 1 : -1;
      const env = Math.min(1, localT * 20) * Math.max(0, 1 - localT * 1.5);
      voice = sq * env * 0.18;
    }
    buffer[i] = splat + voice;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateThornHitSound(): string {
  // Long, painful: 500ms with descending pain tone 600→130Hz at louder amp.
  const sampleRate = 44100;
  const duration = 0.5;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;

    const stab = Math.sin(2 * Math.PI * 1200 * t) * Math.max(0, 1 - progress * 8) * 0.35;
    const painFreq = 600 + (130 - 600) * progress;
    const pain = Math.sin(2 * Math.PI * painFreq * t) * Math.max(0, 1 - progress * 3) * 0.32;
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
  // Layer 1 (0–280ms): "Triple-dramatic" with 2 bite centers (18%, 62%) —
  // each bite has a triangular envelope + sharp transient at its leading edge.
  // Layer 2 (180–300ms): C6→F6 rising 4th jingle (square wave, 60ms per note).
  const sampleRate = 44100;
  const duration = 0.5;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  const biteCenters = [0.18, 0.62];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // ---- Chomp-chomp layer (0..0.28s) ----
    let chomp = 0;
    if (t < 0.28) {
      const splatProg = t / 0.28;
      let env = 0;
      let transient = 0;
      for (const c of biteCenters) {
        const dist = Math.abs(splatProg - c);
        if (dist < 0.07) env = Math.max(env, (1 - dist / 0.07) ** 1.2);
        const dt = splatProg - c;
        if (dt > 0 && dt < 0.025) {
          transient += (Math.random() * 2 - 1) * Math.exp(-dt * 80) * 0.55;
        }
      }
      const noise = (Math.random() * 2 - 1) * 0.85;
      const harm = Math.sin(2 * Math.PI * 600 * t) * 0.3;
      chomp = ((noise + harm) * env + transient) * 0.95;
    }
    // ---- Jingle layer (0.18..0.30s) — 2-note rising 4th C6 → F6 ----
    let jingle = 0;
    const localT = t - 0.18;
    if (localT >= 0 && localT < 0.12) {
      const f = localT < 0.06 ? 1047 : 1397;
      const noteT = localT < 0.06 ? localT : localT - 0.06;
      const noteP = noteT / 0.06;
      const phase = (t * f) % 1;
      const sq = phase < 0.5 ? 1 : -1;
      const env = Math.min(1, noteP * 30) * Math.max(0, 1 - noteP * 0.5);
      jingle = sq * env * 0.16;
    }
    buffer[i] = chomp + jingle;
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
    const tone = Math.sin(2 * Math.PI * 160 * t) * Math.exp(-progress * 30) * 0.3;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 18) * 0.25;
    buffer[i] = tone + noise;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateOofSound(): string {
  // Comic-book POW: descending square 280→80Hz with exp decay + brief noise tail.
  const sampleRate = 44100;
  const duration = 0.18;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const freq = 280 - 200 * progress;
    const phase = (t * freq) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const env = Math.exp(-progress * 4) * 0.32;
    const noise = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 15) * 0.25;
    buffer[i] = sq * env + noise;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateSplashSound(): string {
  // Watery: initial slap (fast-decay noise) + low-pass body bell-curve at 30% +
  // droplet noise tail in second half. 320ms total.
  const sampleRate = 44100;
  const duration = 0.32;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let lp = 0;
  for (let i = 0; i < numSamples; i++) {
    const progress = i / numSamples;
    const slap = (Math.random() * 2 - 1) * Math.max(0, 1 - progress * 25) * 0.45;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const body = lp * Math.max(0, 1 - Math.abs(progress - 0.3) * 6) * 0.3;
    const droplets = (Math.random() * 2 - 1) * Math.max(0, progress - 0.5) * Math.max(0, 1 - progress) * 0.15;
    buffer[i] = slap + body + droplets;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateLandSound(): string {
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
  // Lower body (280→130Hz triangle, 200ms) with very soft knock — the original
  // hard knock made hits feel like bell-strikes; softer reads as "hollow bonk".
  const sampleRate = 44100;
  const duration = 0.2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const knock = progress < 0.1 ? Math.sin(2 * Math.PI * 1000 * t) * 0.15 : 0;
    const freq = 280 + (130 - 280) * progress;
    const envelope = Math.max(0, 1 - progress * 1.8) * 0.6;
    const phase = (t * freq) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
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
    const noise = (Math.random() * 2 - 1) * 0.25;
    const tone = Math.sin(2 * Math.PI * 160 * t) * 0.2;
    buffer[i] = (noise + tone) * envelope;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateSpringSound(): string {
  // Triangle sweep 240→860Hz over 140ms — chiptune "phaseJump" character,
  // brighter and more cartoony than a wobbling sine.
  const sampleRate = 44100;
  const duration = 0.14;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const freq = 240 + 620 * progress;
    const phase = (t * freq) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const env = Math.min(1, progress * 25) * Math.max(0, 1 - progress) ** 0.85 * 0.42;
    buffer[i] = tri * env;
  }
  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateCrouchSound(): string {
  // Soft and short — the crouch key is often held, so this needs to not fatigue.
  const sampleRate = 44100;
  const duration = 0.08;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  let lp = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const noise = Math.random() * 2 - 1;
    lp += 0.12 * (noise - lp);
    const jitter = 1 + 0.2 * Math.sin(2 * Math.PI * 80 * t);
    const env = Math.min(1, progress * 8) * Math.max(0, 1 - progress) ** 1.5;
    buffer[i] = lp * jitter * env * 0.4;
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
