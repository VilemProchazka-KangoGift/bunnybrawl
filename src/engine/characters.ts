import type { CharacterDef, CharacterSlot } from './types';

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
};

export function getCharacter(slot: CharacterSlot): CharacterDef {
  return CHARACTERS[slot];
}
