import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Tiger', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 200, freqEnd: 120, duration: 0.28, type: 'sawtooth' },
    { freq: 120, freqEnd: 80, duration: 0.22, type: 'sawtooth' },
  ], 0.5)],
  volume: 0.45,
}));
