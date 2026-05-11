import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Cat', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 700, freqEnd: 500, duration: 0.15, type: 'sine' },
    { freq: 500, freqEnd: 650, duration: 0.18, type: 'sine' },
  ], 0.4)],
  volume: 0.4,
}));
