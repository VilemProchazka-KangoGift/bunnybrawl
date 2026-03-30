import type { CharacterDef, CharacterSlot } from './types';

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
];

export function getCharacter(slot: CharacterSlot): CharacterDef {
  return CHARACTERS[slot];
}
