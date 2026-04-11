import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinCharacters } from '../builtin';
import { getCharacterPack } from '../registry';

// All 17 built-in character names
const CHARACTER_NAMES = [
  'Bunny', 'Fox', 'Frog', 'Bear', 'Owl', 'Cat', 'Wolf', 'Panda',
  'Pig', 'Cow', 'Goat', 'Horse', 'Sheep', 'Monkey', 'Tiger', 'Rhino', 'Hedgehog',
];

const VALID_IDLE_TRANSFORMS = ['none', 'headTilt', 'headFlip', 'headBob'];

beforeAll(() => {
  registerBuiltinCharacters();
});

describe('Character Pack Validation', () => {
  it('all 17 character packs are registered', () => {
    for (const name of CHARACTER_NAMES) {
      expect(getCharacterPack(name), `${name} should be registered`).toBeDefined();
    }
  });

  describe.each(CHARACTER_NAMES)('%s', (name) => {
    it('has name, color (hex), darkColor, lightColor', () => {
      const pack = getCharacterPack(name)!;
      expect(pack.name).toBe(name);
      expect(pack.color).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      expect(pack.darkColor).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      expect(pack.lightColor).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
    });

    it('has drawSprite function', () => {
      const pack = getCharacterPack(name)!;
      expect(typeof pack.drawSprite).toBe('function');
    });

    it('has drawGib function', () => {
      const pack = getCharacterPack(name)!;
      expect(typeof pack.drawGib).toBe('function');
    });

    it('has gibs array with at least 1 entry', () => {
      const pack = getCharacterPack(name)!;
      expect(Array.isArray(pack.gibs)).toBe(true);
      expect(pack.gibs.length).toBeGreaterThanOrEqual(1);
    });

    it('each gib has gibType, width > 0, height > 0', () => {
      const pack = getCharacterPack(name)!;
      for (const gib of pack.gibs) {
        expect(gib.gibType, `gib in ${name} missing gibType`).toBeDefined();
        expect(gib.width, `gib ${gib.gibType} in ${name} width`).toBeGreaterThan(0);
        expect(gib.height, `gib ${gib.gibType} in ${name} height`).toBeGreaterThan(0);
      }
    });

    it('has translations with at least en and cs', () => {
      const pack = getCharacterPack(name)!;
      expect(pack.translations).toBeDefined();
      expect(pack.translations!.en, `${name} missing English translation`).toBeDefined();
      expect(pack.translations!.cs, `${name} missing Czech translation`).toBeDefined();
      expect(pack.translations!.en.length).toBeGreaterThan(0);
      expect(pack.translations!.cs.length).toBeGreaterThan(0);
    });

    it('has idleTransform in valid set', () => {
      const pack = getCharacterPack(name)!;
      expect(VALID_IDLE_TRANSFORMS).toContain(pack.idleTransform);
    });

    it('has splatShape defined', () => {
      const pack = getCharacterPack(name)!;
      expect(pack.splatShape).toBeDefined();
      expect(typeof pack.splatShape).toBe('string');
    });

    it('has bodyEllipse function', () => {
      const pack = getCharacterPack(name)!;
      expect(typeof pack.bodyEllipse).toBe('function');
      // Verify it returns expected shape
      const result = pack.bodyEllipse(100, 50, 30, 40);
      expect(result).toHaveProperty('cx');
      expect(result).toHaveProperty('cy');
      expect(result).toHaveProperty('rx');
      expect(result).toHaveProperty('ry');
    });
  });

  it('no two packs have the same emoji', () => {
    const emojis = new Map<string, string>();
    for (const name of CHARACTER_NAMES) {
      const pack = getCharacterPack(name)!;
      const existing = emojis.get(pack.emoji);
      expect(existing, `${name} and ${existing} share emoji ${pack.emoji}`).toBeUndefined();
      emojis.set(pack.emoji, name);
    }
  });
});
