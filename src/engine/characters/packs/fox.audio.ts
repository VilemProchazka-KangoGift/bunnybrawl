import { Howl } from 'howler';
import { generateToneBuffer } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Fox', (): Howl => new Howl({
  src: [generateToneBuffer(600, 0.1, 'sawtooth', 0.4, 400)],
  volume: 0.4,
}));
