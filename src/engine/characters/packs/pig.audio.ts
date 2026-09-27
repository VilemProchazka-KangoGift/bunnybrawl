import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Pig', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 250, freqEnd: 350, duration: 0.05, type: 'square' },
    { freq: 350, freqEnd: 200, duration: 0.07, type: 'square' },
    { freq: 250, freqEnd: 350, duration: 0.05, type: 'square' },
    { freq: 350, freqEnd: 200, duration: 0.07, type: 'square' },
  ], 0.4)],
  volume: 0.4,
}));
