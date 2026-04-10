import { describe, it, expect } from 'vitest';
import { isBotSlot, ALL_BOT_SLOTS } from './types';
import type { CharacterSlot, BotSlot, PlayerSlot } from './types';

describe('isBotSlot', () => {
  it('returns true for B1', () => {
    expect(isBotSlot('B1')).toBe(true);
  });

  it('returns true for B2 through B5', () => {
    expect(isBotSlot('B2')).toBe(true);
    expect(isBotSlot('B3')).toBe(true);
    expect(isBotSlot('B4')).toBe(true);
    expect(isBotSlot('B5')).toBe(true);
  });

  it('returns false for P1', () => {
    expect(isBotSlot('P1')).toBe(false);
  });

  it('returns false for P2 through P5', () => {
    expect(isBotSlot('P2')).toBe(false);
    expect(isBotSlot('P3')).toBe(false);
    expect(isBotSlot('P4')).toBe(false);
    expect(isBotSlot('P5')).toBe(false);
  });

  it('returns false for all character slots', () => {
    const characterSlots: CharacterSlot[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
    for (const slot of characterSlots) {
      expect(isBotSlot(slot)).toBe(false);
    }
  });

  it('returns true for all bot slots', () => {
    const botSlots: BotSlot[] = ['B1', 'B2', 'B3', 'B4', 'B5'];
    for (const slot of botSlots) {
      expect(isBotSlot(slot)).toBe(true);
    }
  });
});

describe('ALL_BOT_SLOTS', () => {
  it('contains exactly 5 bot slots', () => {
    expect(ALL_BOT_SLOTS).toHaveLength(5);
  });

  it('contains B1 through B5 in order', () => {
    expect(ALL_BOT_SLOTS).toEqual(['B1', 'B2', 'B3', 'B4', 'B5']);
  });

  it('every entry is recognized as a bot slot', () => {
    for (const slot of ALL_BOT_SLOTS) {
      expect(isBotSlot(slot)).toBe(true);
    }
  });

  it('entries are valid PlayerSlot values', () => {
    // TypeScript ensures this at compile time, but verify at runtime
    // that all entries start with "B" and end with a digit 1-5
    for (const slot of ALL_BOT_SLOTS) {
      expect(slot).toMatch(/^B[1-5]$/);
    }
  });
});

describe('PlayerSlot type coverage', () => {
  it('character slots P1-P5 are valid PlayerSlot values', () => {
    const characterSlots: PlayerSlot[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
    expect(characterSlots).toHaveLength(5);
    for (const slot of characterSlots) {
      expect(slot).toMatch(/^P[1-5]$/);
    }
  });

  it('bot slots B1-B5 are valid PlayerSlot values', () => {
    const botSlots: PlayerSlot[] = ['B1', 'B2', 'B3', 'B4', 'B5'];
    expect(botSlots).toHaveLength(5);
    for (const slot of botSlots) {
      expect(slot).toMatch(/^B[1-5]$/);
    }
  });

  it('PlayerSlot union covers all 10 slots', () => {
    const allSlots: PlayerSlot[] = [
      'P1', 'P2', 'P3', 'P4', 'P5',
      'B1', 'B2', 'B3', 'B4', 'B5',
    ];
    expect(allSlots).toHaveLength(10);

    // Verify no duplicates
    const unique = new Set(allSlots);
    expect(unique.size).toBe(10);
  });

  it('isBotSlot correctly partitions PlayerSlot into bots and characters', () => {
    const allSlots: PlayerSlot[] = [
      'P1', 'P2', 'P3', 'P4', 'P5',
      'B1', 'B2', 'B3', 'B4', 'B5',
    ];

    const bots = allSlots.filter(isBotSlot);
    const characters = allSlots.filter(s => !isBotSlot(s));

    expect(bots).toHaveLength(5);
    expect(characters).toHaveLength(5);
    expect(bots).toEqual(['B1', 'B2', 'B3', 'B4', 'B5']);
    expect(characters).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
  });
});
