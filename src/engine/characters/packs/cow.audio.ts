import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Cow', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 130, freqEnd: 160, duration: 0.15, type: 'sine' },
    { freq: 160, freqEnd: 130, duration: 0.25, type: 'sine' },
  ], 0.4)],
  volume: 0.4,
}));
