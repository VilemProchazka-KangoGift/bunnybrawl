import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Chick', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 1700, freqEnd: 1450, duration: 0.06, type: 'square' },
    { freq: 1700, freqEnd: 1350, duration: 0.08, type: 'square' },
  ], 0.35)],
  volume: 0.4,
}));
