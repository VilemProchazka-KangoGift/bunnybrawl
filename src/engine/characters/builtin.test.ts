import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinCharacters } from './builtin';
import { registerBuiltinArenas } from '../arenas/builtin';
import { getCharacterPack, getAllCharacterDefs, getSpriteRenderer, getGibRenderer, getCharacterEmoji } from './registry';

beforeAll(() => {
  try { registerBuiltinArenas(); } catch { /* ok */ }
  registerBuiltinCharacters();
});

describe('Builtin character registration', () => {
  const EXPECTED_CHARACTERS = [
    'Bunny', 'Fox', 'Frog', 'Bear', 'Owl', 'Cat', 'Wolf', 'Panda',
    'Pig', 'Cow', 'Goat', 'Horse', 'Sheep', 'Monkey', 'Tiger', 'Rhino', 'Hedgehog', 'Chick',
  ];

  it('registers all 18 builtin characters', () => {
    for (const name of EXPECTED_CHARACTERS) {
      expect(getCharacterPack(name), `${name} should be registered`).toBeDefined();
    }
  });

  it('all characters have an emoji', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const emoji = getCharacterEmoji(name);
      expect(emoji, `${name} should have emoji`).not.toBe('?');
      expect(emoji.length).toBeGreaterThan(0);
    }
  });

  it('all characters have a sprite renderer', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const renderer = getSpriteRenderer(name);
      expect(typeof renderer).toBe('function');
    }
  });

  it('all characters have a gib renderer', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const renderer = getGibRenderer(name);
      expect(typeof renderer).toBe('function');
    }
  });

  it('all characters have English translations', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const pack = getCharacterPack(name)!;
      expect(pack.translations?.en, `${name} should have English translation`).toBeDefined();
    }
  });

  it('all characters have Czech translations', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const pack = getCharacterPack(name)!;
      expect(pack.translations?.cs, `${name} should have Czech translation`).toBeDefined();
    }
  });

  it('all characters have color, darkColor, lightColor', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const pack = getCharacterPack(name)!;
      expect(pack.color, `${name}.color`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(pack.darkColor, `${name}.darkColor`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(pack.lightColor, `${name}.lightColor`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('all characters have a splatShape', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const pack = getCharacterPack(name)!;
      expect(pack.splatShape).toBeDefined();
    }
  });

  it('all characters have gibs array', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const pack = getCharacterPack(name)!;
      expect(Array.isArray(pack.gibs)).toBe(true);
      expect(pack.gibs.length).toBeGreaterThan(0);
    }
  });

  it('no character has the legacy idleTransform field', () => {
    for (const name of EXPECTED_CHARACTERS) {
      const pack = getCharacterPack(name)! as unknown as Record<string, unknown>;
      expect(pack.idleTransform).toBeUndefined();
    }
  });

  it('getAllCharacterDefs returns at least 18 entries', () => {
    const defs = getAllCharacterDefs();
    expect(defs.length).toBeGreaterThanOrEqual(18);
  });
});
