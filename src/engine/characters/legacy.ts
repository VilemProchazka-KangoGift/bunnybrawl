import type { CharacterDef, CharacterSlot, PlayerSlot, BotSlot } from '../types';
import { isBotSlot } from '../types';
import { getAllCharacterDefs } from './registry';

// Default characters tied to player slots (used before lobby reassignment)
export const CHARACTERS: Record<CharacterSlot, CharacterDef> = {
  P1: { slot: 'P1', name: 'Bunny', color: '#FFFFFF', darkColor: '#CCCCCC', lightColor: '#FFFFFF' },
  P2: { slot: 'P2', name: 'Fox', color: '#FF8C00', darkColor: '#CC6600', lightColor: '#FFB347' },
  P3: { slot: 'P3', name: 'Frog', color: '#32CD32', darkColor: '#228B22', lightColor: '#7CFC00' },
  P4: { slot: 'P4', name: 'Bear', color: '#8B4513', darkColor: '#654321', lightColor: '#D2691E' },
  P5: { slot: 'P5', name: 'Owl', color: '#9370DB', darkColor: '#6A4DB0', lightColor: '#B8A0E8' },
};

/** Full roster derived from the character pack registry.
 *  Must be called after registerBuiltinCharacters(). */
export function getAllCharacters(): CharacterDef[] {
  return getAllCharacterDefs();
}

// Runtime map for bot character assignments (populated before match start)
export const BOT_CHARACTERS: Map<BotSlot, CharacterDef> = new Map();

export function getCharacterForSlot(slot: PlayerSlot): CharacterDef {
  if (isBotSlot(slot)) {
    const char = BOT_CHARACTERS.get(slot);
    if (!char) throw new Error(`No character assigned to bot slot ${slot}`);
    return char;
  }
  return CHARACTERS[slot];
}

/** Assign characters from registry to bot slots, avoiding characters already taken by humans.
 *  Optional seed for deterministic assignment (required for online play). */
export function assignBotCharacters(humanSlots: CharacterSlot[], botSlots: BotSlot[], seed?: number): void {
  BOT_CHARACTERS.clear();
  const usedNames = new Set(humanSlots.map(s => CHARACTERS[s].name));
  const available = getAllCharacters().filter(c => !usedNames.has(c.name));
  const shuffled = [...available];
  // Seeded PRNG (mulberry32) when seed provided, Math.random otherwise
  let st = seed ?? 0;
  const rnd = seed != null ? () => {
    st = (st + 0x6d2b79f5) | 0;
    let t = Math.imul(st ^ (st >>> 15), 1 | st);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  } : Math.random;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i < botSlots.length; i++) {
    const char = shuffled[i % shuffled.length];
    BOT_CHARACTERS.set(botSlots[i], { ...char, slot: botSlots[i] });
  }
}
