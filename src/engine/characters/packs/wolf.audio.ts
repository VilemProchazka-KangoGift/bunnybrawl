import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Wolf', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 250, freqEnd: 600, duration: 0.12, type: 'sawtooth' },
    { freq: 600, freqEnd: 350, duration: 0.23, type: 'sawtooth' },
  ], 0.4)],
  volume: 0.4,
}));
