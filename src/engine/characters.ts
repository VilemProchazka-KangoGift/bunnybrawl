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
    color: '#FFB6C1',
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
];

export function getCharacter(slot: CharacterSlot): CharacterDef {
  return CHARACTERS[slot];
}
