import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Rhino', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 160, freqEnd: 120, duration: 0.08, type: 'square' },
    { freq: 130, freqEnd: 110, duration: 0.06, type: 'square' },
    { freq: 120, freqEnd: 150, duration: 0.16, type: 'sawtooth' },
  ], 0.5)],
  volume: 0.45,
}));
