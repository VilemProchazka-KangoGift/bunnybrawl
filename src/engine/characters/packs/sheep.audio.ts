import { Howl } from 'howler';
import { floatBufferToWavDataUri } from '../../audio/synthesis/wav';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Sheep', (): Howl => {
  // Wobbly baa — 350→250Hz sine with 12Hz vibrato (depth 18Hz).
  const sampleRate = 44100;
  const duration = 0.3;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const baseFreq = 350 + (250 - 350) * progress;
    const wobble = Math.sin(2 * Math.PI * 12 * t) * 18;
    const envelope = Math.max(0, 1 - progress) * 0.4;
    buffer[i] = Math.sin(2 * Math.PI * (baseFreq + wobble) * t) * envelope;
  }
  return new Howl({ src: [floatBufferToWavDataUri(buffer, sampleRate)], volume: 0.4 });
});
