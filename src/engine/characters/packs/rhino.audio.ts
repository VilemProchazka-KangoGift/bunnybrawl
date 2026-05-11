import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Rhino', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 130, freqEnd: 70, duration: 0.08, type: 'square' },
    { freq: 70, freqEnd: 50, duration: 0.06, type: 'square' },
    { freq: 50, freqEnd: 80, duration: 0.16, type: 'sine' },
  ], 0.5)],
  volume: 0.45,
}));
