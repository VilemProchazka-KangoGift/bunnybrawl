import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Axolotl', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 600, freqEnd: 800, duration: 0.06, type: 'sine' },
    { freq: 750, freqEnd: 650, duration: 0.06, type: 'sine' },
  ], 0.3)],
  volume: 0.4,
}));
