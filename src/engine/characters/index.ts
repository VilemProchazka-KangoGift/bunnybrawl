export type {
  CharacterPack,
  CharacterRenderer,
  GibRenderer,
  CharacterColors,
  SimpleSoundDef,
  SegmentSoundDef,
  CustomSoundDef,
  SoundDef,
  IdleTransformType,
} from './types';

export {
  registerCharacter,
  getCharacterPack,
  listCharacterNames,
  listCharacterPacks,
  getCharacterEmoji,
  hasCustomEyes,
  getCharacterSplatShape,
  getCharacterGibs,
  getCharacterPersonality,
  getSpriteRenderer,
  getGibRenderer,
  getAllCharacterDefs,
} from './registry';

export {
  fallbackSpriteRenderer,
  fallbackGibRenderer,
} from './fallbacks';

export { registerBuiltinCharacters } from './builtin';

// Re-export legacy symbols for backward compatibility
export {
  CHARACTERS,
  ALL_CHARACTERS,
  CHAR_EMOJI,
  CUSTOM_EYE_CHARS,
  BOT_CHARACTERS,
  getCharacter,
  getCharacterForSlot,
  assignBotCharacters,
} from './legacy';
