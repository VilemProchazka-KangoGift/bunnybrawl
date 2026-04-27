/**
 * Synthesis function tests.
 *
 * All generators are pure functions: Float32Array math → WAV data URI.
 * Tests verify output format, non-emptiness, and basic signal properties.
 */
import { describe, it, expect } from 'vitest';
import { floatBufferToWavDataUri } from './wav';
import { generateToneBuffer, generateMultiSegmentTone } from './core';
import {
  generateJumpSound, generateStompSound, generateVictorySound,
  generateSelectSound, generateThornHitSound, generateCrunchSound,
  generateFootstepGrass, generateFootstepWood, generateOofSound,
  generateSplashSound, generateLandSound, generateHeadbonkSound,
  generateBumpSound, generateSpringSound, generateCrouchSound,
  generateFastfallSound,
} from './sfx';
import {
  generateAmbientSound, generateCrowdSound, generateZeroGSound,
  generateWaterfallSound, generateAmbWindSound, generateAmbLavaSound,
  generateAmbSpaceHumSound,
} from './ambient';
import {
  generateGeyserSound, generatePigeonScatterSound,
  generateAmbBirdChirpSound, generateAmbGhostHooSound,
  generateAmbVolcanoBurstSound,
} from './periodic';

const WAV_PREFIX = 'data:audio/wav;base64,';

function isValidWav(uri: string): boolean {
  return uri.startsWith(WAV_PREFIX) && uri.length > WAV_PREFIX.length + 50;
}

function decodeWavSamples(uri: string): { sampleRate: number; samples: Float32Array } {
  const b64 = uri.slice(WAV_PREFIX.length);
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const sampleRate = view.getUint32(24, true);
  const dataSize = view.getUint32(40, true);
  const numSamples = dataSize / 2;
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const int16 = view.getInt16(44 + i * 2, true);
    samples[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
  }
  return { sampleRate, samples };
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function peak(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > max) max = abs;
  }
  return max;
}

// ---- wav.ts ----

describe('floatBufferToWavDataUri', () => {
  it('produces valid WAV for a simple buffer', () => {
    const buf = new Float32Array([0, 0.5, 1, -1, 0]);
    const uri = floatBufferToWavDataUri(buf, 44100);
    expect(isValidWav(uri)).toBe(true);
  });

  it('encodes correct sample rate', () => {
    const buf = new Float32Array(100);
    const { sampleRate } = decodeWavSamples(floatBufferToWavDataUri(buf, 22050));
    expect(sampleRate).toBe(22050);
  });

  it('roundtrips sample count', () => {
    const buf = new Float32Array(512);
    for (let i = 0; i < 512; i++) buf[i] = Math.sin(i * 0.1);
    const { samples } = decodeWavSamples(floatBufferToWavDataUri(buf, 44100));
    expect(samples.length).toBe(512);
  });

  it('clamps values outside [-1, 1]', () => {
    const buf = new Float32Array([2, -2]);
    const { samples } = decodeWavSamples(floatBufferToWavDataUri(buf, 44100));
    // Clamped to 1 and -1 respectively
    expect(samples[0]).toBeCloseTo(1, 2);
    expect(samples[1]).toBeCloseTo(-1, 2);
  });
});

// ---- core.ts ----

describe('generateToneBuffer', () => {
  it('produces valid WAV data URI', () => {
    const uri = generateToneBuffer(440, 0.1, 'sine', 0.5);
    expect(isValidWav(uri)).toBe(true);
  });

  it('produces correct duration at 44100 Hz', () => {
    const uri = generateToneBuffer(440, 0.1, 'sine', 0.3);
    const { samples, sampleRate } = decodeWavSamples(uri);
    expect(sampleRate).toBe(44100);
    expect(samples.length).toBe(Math.floor(44100 * 0.1));
  });

  it('has non-zero signal for audible parameters', () => {
    const uri = generateToneBuffer(440, 0.1, 'sine', 0.5);
    const { samples } = decodeWavSamples(uri);
    expect(rms(samples)).toBeGreaterThan(0.05);
  });

  it('supports frequency sweep (freqEnd)', () => {
    const uri = generateToneBuffer(200, 0.1, 'sine', 0.5, 800);
    const { samples } = decodeWavSamples(uri);
    expect(rms(samples)).toBeGreaterThan(0.05);
  });

  it('supports all oscillator types', () => {
    for (const type of ['sine', 'square', 'sawtooth', 'triangle'] as OscillatorType[]) {
      const uri = generateToneBuffer(440, 0.05, type, 0.5);
      expect(isValidWav(uri), `should produce WAV for ${type}`).toBe(true);
      const { samples } = decodeWavSamples(uri);
      expect(peak(samples), `should have signal for ${type}`).toBeGreaterThan(0.1);
    }
  });

  it('applies decay envelope — end is quieter than start', () => {
    const uri = generateToneBuffer(440, 0.2, 'square', 0.5);
    const { samples } = decodeWavSamples(uri);
    const firstQuarter = samples.slice(0, Math.floor(samples.length / 4));
    const lastQuarter = samples.slice(Math.floor(samples.length * 3 / 4));
    expect(rms(firstQuarter)).toBeGreaterThan(rms(lastQuarter) * 2);
  });
});

describe('generateMultiSegmentTone', () => {
  it('produces valid WAV data URI', () => {
    const uri = generateMultiSegmentTone([
      { freq: 400, freqEnd: 300, duration: 0.1, type: 'sine' },
      { freq: 300, freqEnd: 400, duration: 0.1, type: 'sine' },
    ], 0.4);
    expect(isValidWav(uri)).toBe(true);
  });

  it('total duration matches sum of segments', () => {
    const uri = generateMultiSegmentTone([
      { freq: 400, duration: 0.1, type: 'sine' },
      { freq: 500, duration: 0.15, type: 'sine' },
    ], 0.3);
    const { samples } = decodeWavSamples(uri);
    expect(samples.length).toBe(Math.floor(44100 * 0.25));
  });

  it('has non-zero signal', () => {
    const uri = generateMultiSegmentTone([
      { freq: 300, freqEnd: 500, duration: 0.12, type: 'sawtooth' },
      { freq: 500, freqEnd: 400, duration: 0.23, type: 'sawtooth' },
    ], 0.4);
    const { samples } = decodeWavSamples(uri);
    expect(rms(samples)).toBeGreaterThan(0.02);
  });
});

// ---- SFX generators ----

describe('SFX generators', () => {
  const sfxGenerators: Array<[string, () => string]> = [
    ['jump', generateJumpSound],
    ['stomp', generateStompSound],
    ['victory', generateVictorySound],
    ['select', generateSelectSound],
    ['thornhit', generateThornHitSound],
    ['crunch', generateCrunchSound],
    ['footstep_grass', generateFootstepGrass],
    ['footstep_wood', generateFootstepWood],
    ['oof', generateOofSound],
    ['splash', generateSplashSound],
    ['land', generateLandSound],
    ['headbonk', generateHeadbonkSound],
    ['bump', generateBumpSound],
    ['spring', generateSpringSound],
    ['crouch', generateCrouchSound],
    ['fastfall', generateFastfallSound],
  ];

  for (const [name, gen] of sfxGenerators) {
    it(`${name}: produces valid WAV with non-zero signal`, () => {
      const uri = gen();
      expect(isValidWav(uri), `${name} should be valid WAV`).toBe(true);
      const { samples } = decodeWavSamples(uri);
      expect(samples.length, `${name} should have samples`).toBeGreaterThan(0);
      expect(peak(samples), `${name} should have audible signal`).toBeGreaterThan(0.05);
    });
  }
});

// ---- Ambient generators ----

describe('Ambient generators', () => {
  const ambientGenerators: Array<[string, () => string]> = [
    ['ambient', generateAmbientSound],
    ['crowd', generateCrowdSound],
    ['zero_g', generateZeroGSound],
    ['waterfall', generateWaterfallSound],
    ['wind', generateAmbWindSound],
    ['lava', generateAmbLavaSound],
    ['space_hum', generateAmbSpaceHumSound],
  ];

  for (const [name, gen] of ambientGenerators) {
    it(`${name}: produces valid WAV with non-zero signal`, () => {
      const uri = gen();
      expect(isValidWav(uri), `${name} should be valid WAV`).toBe(true);
      const { samples } = decodeWavSamples(uri);
      expect(samples.length, `${name} should have samples`).toBeGreaterThan(0);
      expect(rms(samples), `${name} should have signal`).toBeGreaterThan(0.001);
    });
  }

  it('ambient loops are long enough (>= 2s at 44100 Hz)', () => {
    const longLoops = [generateAmbientSound, generateZeroGSound, generateAmbSpaceHumSound];
    for (const gen of longLoops) {
      const { samples } = decodeWavSamples(gen());
      expect(samples.length).toBeGreaterThanOrEqual(44100 * 2);
    }
  });
});

// ---- Periodic generators ----

describe('Periodic generators', () => {
  const periodicGenerators: Array<[string, () => string]> = [
    ['geyser', generateGeyserSound],
    ['pigeon_scatter', generatePigeonScatterSound],
    ['bird_chirp', generateAmbBirdChirpSound],
    ['ghost_hoo', generateAmbGhostHooSound],
    ['volcano_burst', generateAmbVolcanoBurstSound],
  ];

  for (const [name, gen] of periodicGenerators) {
    it(`${name}: produces valid WAV with non-zero signal`, () => {
      const uri = gen();
      expect(isValidWav(uri), `${name} should be valid WAV`).toBe(true);
      const { samples } = decodeWavSamples(uri);
      expect(samples.length, `${name} should have samples`).toBeGreaterThan(0);
      expect(peak(samples), `${name} should have audible signal`).toBeGreaterThan(0.01);
    });
  }
});
