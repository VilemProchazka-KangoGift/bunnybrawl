import { Howl } from 'howler';
import { floatBufferToWavDataUri } from '../../audio/synthesis/wav';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Frog', (): Howl => {
  const sampleRate = 44100;
  const duration = 0.32;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const freq = 200 + (150 - 200) * progress;
    const wobble = Math.sin(2 * Math.PI * 30 * t) * 20;
    const actualFreq = freq + wobble;
    const envelope = Math.max(0, 1 - progress) * 0.4;
    const phase = (t * actualFreq) % 1;
    const sample = phase < 0.5 ? 1 : -1;
    buffer[i] = sample * envelope;
  }
  return new Howl({ src: [floatBufferToWavDataUri(buffer, sampleRate)], volume: 0.4 });
});
