import { Howl } from 'howler';
import { generateToneBuffer } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Panda', (): Howl => new Howl({
  src: [generateToneBuffer(380, 0.12, 'triangle', 0.4, 470)],
  volume: 0.4,
}));
