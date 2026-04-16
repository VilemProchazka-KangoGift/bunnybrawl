import type { ToneSegment } from '../types';
import { floatBufferToWavDataUri } from './wav';

function oscillatorSample(type: OscillatorType, phase: number, freq: number, t: number): number {
  switch (type) {
    case 'square': return phase < 0.5 ? 1 : -1;
    case 'sawtooth': return 2 * phase - 1;
    case 'triangle': return 4 * Math.abs(phase - 0.5) - 1;
    default: return Math.sin(2 * Math.PI * freq * t);
  }
}

export function generateToneBuffer(
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
    const phase = (t * freq) % 1;
    buffer[i] = oscillatorSample(type, phase, freq, t) * envelope;
  }

  return floatBufferToWavDataUri(buffer, sampleRate);
}

export function generateMultiSegmentTone(segments: ToneSegment[], volume = 0.3): string {
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
      const phase = (t * freq) % 1;
      buffer[offset + i] = oscillatorSample(seg.type, phase, freq, t) * envelope;
    }
    offset += numSamples;
  }

  return floatBufferToWavDataUri(buffer, sampleRate);
}
