import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { CHARACTERS, getCharacterForSlot, assignBotCharacters, BOT_CHARACTERS, getAllCharacters } from './legacy';
import { registerBuiltinCharacters } from './builtin';
import { registerBuiltinArenas } from '../arenas/builtin';
import type { BotSlot, CharacterSlot } from '../types';

// Register once for all tests in this file
beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

describe('Characters', () => {
  it('has all four characters defined', () => {
    expect(CHARACTERS.P1).toBeDefined();
    expect(CHARACTERS.P2).toBeDefined();
    expect(CHARACTERS.P3).toBeDefined();
    expect(CHARACTERS.P4).toBeDefined();
  });

  it('P1 is Bunny (white)', () => {
    expect(CHARACTERS.P1.name).toBe('Bunny');
    expect(CHARACTERS.P1.color).toBe('#FFFFFF');
  });

  it('P2 is Fox (orange)', () => {
    expect(CHARACTERS.P2.name).toBe('Fox');
    expect(CHARACTERS.P2.color).toBe('#FF8C00');
  });

  it('P3 is Frog (green)', () => {
    expect(CHARACTERS.P3.name).toBe('Frog');
    expect(CHARACTERS.P3.color).toBe('#32CD32');
  });

  it('P4 is Bear (brown)', () => {
    expect(CHARACTERS.P4.name).toBe('Bear');
    expect(CHARACTERS.P4.color).toBe('#8B4513');
  });

  it('each character has dark and light colors', () => {
    for (const char of Object.values(CHARACTERS)) {
      expect(char.darkColor).toBeDefined();
      expect(char.lightColor).toBeDefined();
      expect(char.darkColor).not.toBe(char.lightColor);
    }
  });

  it('P5 is Owl (purple)', () => {
    expect(CHARACTERS.P5.name).toBe('Owl');
    expect(CHARACTERS.P5.color).toBe('#9370DB');
  });

  it('each slot matches the CharacterDef slot field', () => {
    for (const [slot, char] of Object.entries(CHARACTERS)) {
      expect(char.slot).toBe(slot);
    }
  });
});

describe('getCharacterForSlot', () => {
  it('returns CHARACTERS entry for human slots', () => {
    expect(getCharacterForSlot('P1')).toBe(CHARACTERS.P1);
    expect(getCharacterForSlot('P2')).toBe(CHARACTERS.P2);
  });

  it('throws for unassigned bot slot', () => {
    BOT_CHARACTERS.clear();
    expect(() => getCharacterForSlot('B1' as any)).toThrow('No character assigned to bot slot B1');
  });

  it('returns bot character for assigned bot slot', () => {
    assignBotCharacters(['P1', 'P2'] as CharacterSlot[], ['B1'] as BotSlot[]);
    const bot = getCharacterForSlot('B1' as any);
    expect(bot).toBeDefined();
    expect(bot.name).toBeDefined();
    expect(bot.slot).toBe('B1');
  });
});

describe('assignBotCharacters', () => {
  beforeEach(() => {
    BOT_CHARACTERS.clear();
  });

  it('assigns characters to bot slots', () => {
    assignBotCharacters(['P1'] as CharacterSlot[], ['B1', 'B2'] as BotSlot[]);
    expect(BOT_CHARACTERS.size).toBe(2);
    expect(BOT_CHARACTERS.get('B1' as BotSlot)).toBeDefined();
    expect(BOT_CHARACTERS.get('B2' as BotSlot)).toBeDefined();
  });

  it('avoids characters already used by humans', () => {
    assignBotCharacters(['P1'] as CharacterSlot[], ['B1', 'B2', 'B3'] as BotSlot[]);
    const humanChar = CHARACTERS.P1.name;
    for (const [, char] of BOT_CHARACTERS) {
      expect(char.name).not.toBe(humanChar);
    }
  });

  it('deterministic with seed', () => {
    assignBotCharacters(['P1'] as CharacterSlot[], ['B1', 'B2'] as BotSlot[], 42);
    const b1First = BOT_CHARACTERS.get('B1' as BotSlot)!.name;
    const b2First = BOT_CHARACTERS.get('B2' as BotSlot)!.name;

    BOT_CHARACTERS.clear();
    assignBotCharacters(['P1'] as CharacterSlot[], ['B1', 'B2'] as BotSlot[], 42);
    expect(BOT_CHARACTERS.get('B1' as BotSlot)!.name).toBe(b1First);
    expect(BOT_CHARACTERS.get('B2' as BotSlot)!.name).toBe(b2First);
  });

  it('different seeds produce different assignments', () => {
    assignBotCharacters(['P1'] as CharacterSlot[], ['B1', 'B2', 'B3'] as BotSlot[], 1);
    const names1 = Array.from(BOT_CHARACTERS.values()).map(c => c.name);

    BOT_CHARACTERS.clear();
    assignBotCharacters(['P1'] as CharacterSlot[], ['B1', 'B2', 'B3'] as BotSlot[], 999);
    const names2 = Array.from(BOT_CHARACTERS.values()).map(c => c.name);

    // Very unlikely to be identical with different seeds
    expect(names1.join(',')).not.toBe(names2.join(','));
  });

  it('sets slot field on bot characters', () => {
    assignBotCharacters(['P1'] as CharacterSlot[], ['B1', 'B2'] as BotSlot[]);
    expect(BOT_CHARACTERS.get('B1' as BotSlot)!.slot).toBe('B1');
    expect(BOT_CHARACTERS.get('B2' as BotSlot)!.slot).toBe('B2');
  });

  it('clears previous assignments before reassigning', () => {
    assignBotCharacters(['P1'] as CharacterSlot[], ['B1'] as BotSlot[], 42);
    const first = BOT_CHARACTERS.get('B1' as BotSlot)!.name;
    assignBotCharacters(['P1'] as CharacterSlot[], ['B2'] as BotSlot[], 42);
    expect(BOT_CHARACTERS.has('B1' as BotSlot)).toBe(false);
    expect(BOT_CHARACTERS.has('B2' as BotSlot)).toBe(true);
  });
});

describe('getAllCharacters', () => {
  beforeAll(() => {
    try { registerBuiltinArenas(); } catch { /* ok */ }
    registerBuiltinCharacters();
  });

  it('returns at least 17 characters', () => {
    const chars = getAllCharacters();
    expect(chars.length).toBeGreaterThanOrEqual(17);
  });

  it('each character has required fields', () => {
    for (const char of getAllCharacters()) {
      expect(char.name).toBeDefined();
      expect(char.color).toBeDefined();
      expect(char.darkColor).toBeDefined();
      expect(char.lightColor).toBeDefined();
    }
  });
});
