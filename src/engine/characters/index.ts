export type {
  CharacterPack,
  CharacterRenderer,
  GibRenderer,
  CharacterColors,
} from './types';

export {
  registerCharacter,
  getCharacterPack,
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

export {
  CHARACTERS,
  getAllCharacters,
  BOT_CHARACTERS,
  getCharacterForSlot,
  assignBotCharacters,
} from './legacy';
