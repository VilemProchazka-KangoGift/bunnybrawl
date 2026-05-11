import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Hedgehog', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 750, freqEnd: 1000, duration: 0.06, type: 'triangle' },
    { freq: 1000, freqEnd: 620, duration: 0.1, type: 'triangle' },
  ], 0.4)],
  volume: 0.4,
}));
