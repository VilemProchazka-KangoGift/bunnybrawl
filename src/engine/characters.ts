import type { CharacterDef, CharacterSlot, PlayerSlot, BotSlot } from './types';
import { isBotSlot } from './types';

// Characters tied to player slots (used in match)
export const CHARACTERS: Record<CharacterSlot, CharacterDef> = {
  P1: {
    slot: 'P1',
    name: 'Bunny',
    color: '#FFFFFF',
    darkColor: '#CCCCCC',
    lightColor: '#FFFFFF',
  },
  P2: {
    slot: 'P2',
    name: 'Fox',
    color: '#FF8C00',
    darkColor: '#CC6600',
    lightColor: '#FFB347',
  },
  P3: {
    slot: 'P3',
    name: 'Frog',
    color: '#32CD32',
    darkColor: '#228B22',
    lightColor: '#7CFC00',
  },
  P4: {
    slot: 'P4',
    name: 'Bear',
    color: '#8B4513',
    darkColor: '#654321',
    lightColor: '#D2691E',
  },
  P5: {
    slot: 'P5',
    name: 'Owl',
    color: '#9370DB',
    darkColor: '#6A4DB0',
    lightColor: '#B8A0E8',
  },
};

// Full roster of available characters (including extras for lobby swapping)
export const ALL_CHARACTERS: CharacterDef[] = [
  CHARACTERS.P1, // Bunny
  CHARACTERS.P2, // Fox
  CHARACTERS.P3, // Frog
  CHARACTERS.P4, // Bear
  CHARACTERS.P5, // Owl
  {
    slot: 'P1', // slot is reassigned at lobby time
    name: 'Cat',
    color: '#E8A030',
    darkColor: '#CC8A9A',
    lightColor: '#FFD4E0',
  },
  {
    slot: 'P1',
    name: 'Wolf',
    color: '#708090',
    darkColor: '#4A5A68',
    lightColor: '#A0B0C0',
  },
  {
    slot: 'P1',
    name: 'Panda',
    color: '#F0F0F0',
    darkColor: '#333333',
    lightColor: '#FFFFFF',
  },
  {
    slot: 'P1',
    name: 'Pig',
    color: '#F4A6B0',
    darkColor: '#C88090',
    lightColor: '#FFD0D8',
  },
  {
    slot: 'P1',
    name: 'Cow',
    color: '#F5F0E0',
    darkColor: '#4A3A2A',
    lightColor: '#FFFFFF',
  },
  {
    slot: 'P1',
    name: 'Goat',
    color: '#C8B896',
    darkColor: '#8A7A60',
    lightColor: '#E8D8C0',
  },
  {
    slot: 'P1',
    name: 'Horse',
    color: '#8B6040',
    darkColor: '#5C3A20',
    lightColor: '#B08060',
  },
  {
    slot: 'P1',
    name: 'Sheep',
    color: '#F0EDE8',
    darkColor: '#B0A898',
    lightColor: '#FFFFFF',
  },
  {
    slot: 'P1',
    name: 'Monkey',
    color: '#B07040',
    darkColor: '#704020',
    lightColor: '#D09060',
  },
  {
    slot: 'P1',
    name: 'Tiger',
    color: '#E8820A',
    darkColor: '#1A1A1A',
    lightColor: '#FFD080',
  },
  {
    slot: 'P1',
    name: 'Rhino',
    color: '#8A8A8A',
    darkColor: '#5A5A5A',
    lightColor: '#B0B0B0',
  },
];

// Emoji mapping for all characters (used by renderer, lobby, victory screen)
export const CHAR_EMOJI: Record<string, string> = {
  Bunny: '\uD83D\uDC30', Fox: '\uD83E\uDD8A', Frog: '\uD83D\uDC38',
  Bear: '\uD83D\uDC3B', Owl: '\uD83E\uDD89', Cat: '\uD83D\uDC31',
  Wolf: '\uD83D\uDC3A', Panda: '\uD83D\uDC3C', Pig: '\uD83D\uDC37',
  Cow: '\uD83D\uDC2E', Goat: '\uD83D\uDC10', Horse: '\uD83D\uDC34',
  Sheep: '\uD83D\uDC11', Monkey: '\uD83D\uDC35',
  Tiger: '\uD83D\uDC2F', Rhino: '\uD83E\uDD8F',
};

// Characters that draw their own eyes (skip default eye drawing)
export const CUSTOM_EYE_CHARS = new Set(['Frog', 'Owl', 'Cat', 'Panda', 'Cow', 'Goat', 'Sheep', 'Monkey', 'Horse']);

// Runtime map for bot character assignments (populated before match start)
export const BOT_CHARACTERS: Map<BotSlot, CharacterDef> = new Map();

export function getCharacter(slot: CharacterSlot): CharacterDef {
  return CHARACTERS[slot];
}

export function getCharacterForSlot(slot: PlayerSlot): CharacterDef {
  if (isBotSlot(slot)) {
    const char = BOT_CHARACTERS.get(slot);
    if (!char) throw new Error(`No character assigned to bot slot ${slot}`);
    return char;
  }
  return CHARACTERS[slot];
}

/** Assign characters from ALL_CHARACTERS to bot slots, avoiding characters already taken by humans. */
export function assignBotCharacters(humanSlots: CharacterSlot[], botSlots: BotSlot[]): void {
  BOT_CHARACTERS.clear();
  const usedNames = new Set(humanSlots.map(s => CHARACTERS[s].name));
  const available = ALL_CHARACTERS.filter(c => !usedNames.has(c.name));
  // Fisher-Yates shuffle
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i < botSlots.length; i++) {
    const char = shuffled[i % shuffled.length];
    BOT_CHARACTERS.set(botSlots[i], { ...char, slot: botSlots[i] });
  }
}
