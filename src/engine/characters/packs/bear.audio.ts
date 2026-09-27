import { Howl } from 'howler';
import { generateToneBuffer } from '../../audio/synthesis/core';
import { registerCharacterVoice } from '../../audio/characterVoices';

registerCharacterVoice('Bear', (): Howl => new Howl({
  src: [generateToneBuffer(120, 0.3, 'sawtooth', 0.4, 80)],
  volume: 0.4,
}));
