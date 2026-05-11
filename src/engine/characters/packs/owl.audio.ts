import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Owl', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 380, freqEnd: 320, duration: 0.1, type: 'sine' },
    { freq: 380, freqEnd: 320, duration: 0.1, type: 'sine' },
    { freq: 360, freqEnd: 280, duration: 0.18, type: 'sine' },
  ], 0.4)],
  volume: 0.4,
}));
