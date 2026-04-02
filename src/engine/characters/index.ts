export type {
  CharacterPack,
  CharacterRenderer,
  GibRenderer,
  CharacterColors,
} from './types';

export {
  registerCharacter,
  getCharacterPack,
  listCharacterNames,
  listCharacterPacks,
  getCharacterEmoji,
  hasCustomEyes,
  getCharacterSplatShape,
  getCharacterDisplayName,
  getCharacterGibs,
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
  BOT_CHARACTERS,
  getCharacterForSlot,
  assignBotCharacters,
} from './legacy';
