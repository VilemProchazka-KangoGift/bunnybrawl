import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Horse', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 400, freqEnd: 950, duration: 0.1, type: 'sawtooth' },
    { freq: 950, freqEnd: 320, duration: 0.2, type: 'sawtooth' },
  ], 0.4)],
  volume: 0.4,
}));
