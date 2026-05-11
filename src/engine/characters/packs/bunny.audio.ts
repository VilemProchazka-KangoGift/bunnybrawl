import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Bunny', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 800, freqEnd: 1100, duration: 0.05, type: 'square' },
    { freq: 900, freqEnd: 1300, duration: 0.05, type: 'square' },
  ], 0.4)],
  volume: 0.4,
}));
