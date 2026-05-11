import { Howl } from 'howler';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Goat', (): Howl => new Howl({
  src: [generateMultiSegmentTone([
    { freq: 420, freqEnd: 310, duration: 0.06, type: 'sawtooth' },
    { freq: 320, freqEnd: 380, duration: 0.06, type: 'sawtooth' },
    { freq: 380, freqEnd: 320, duration: 0.06, type: 'sawtooth' },
    { freq: 320, freqEnd: 360, duration: 0.08, type: 'sawtooth' },
  ], 0.4)],
  volume: 0.4,
}));
