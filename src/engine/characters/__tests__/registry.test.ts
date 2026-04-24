import { describe, it, expect } from 'vitest';
import type { CharacterPack, CharacterRenderer, GibRenderer } from '../types';
import {
  registerCharacter,
  getCharacterPack,
  getCharacterEmoji,
  hasCustomEyes,
  getCharacterSplatShape,
  getCharacterGibs,
  getCharacterDisplayName,
  getSpriteRenderer,
  getGibRenderer,
  getAllCharacterDefs,
} from '../registry';
import { fallbackSpriteRenderer, fallbackGibRenderer } from '../fallbacks';

// --- Helpers ---

/** No-op renderer satisfying CharacterRenderer signature. */
const noopSprite: CharacterRenderer = () => {};
/** No-op renderer satisfying GibRenderer signature. */
const noopGib: GibRenderer = () => {};
/** No-op bodyEllipse function. */
const noopEllipse = () => ({ cx: 0, cy: 0, rx: 10, ry: 10 });

let packCounter = 0;

/** Create a minimal CharacterPack with a unique name and optional overrides. */
function makePack(overrides: Partial<CharacterPack> = {}): CharacterPack {
  packCounter++;
  return {
    name: `test_char_${packCounter}`,
    emoji: '!',
    color: '#AAA',
    darkColor: '#555',
    lightColor: '#EEE',
    customEyes: false,
    drawSprite: noopSprite,
    drawGib: noopGib,
    splatShape: 'circle',
    gibs: [],
    bodyEllipse: noopEllipse,
    ...overrides,
  };
}

// --- Tests ---

describe('Character Registry', () => {
  // -- register / retrieve --

  it('registerCharacter stores a pack retrievable by getCharacterPack', () => {
    const pack = makePack();
    registerCharacter(pack);
    expect(getCharacterPack(pack.name)).toBe(pack);
  });

  it('getCharacterPack returns undefined for unknown name', () => {
    expect(getCharacterPack('nonexistent_character_xyz')).toBeUndefined();
  });

  it('registerCharacter overwrites existing pack with same name', () => {
    const name = `test_overwrite_${Date.now()}`;
    const pack1 = makePack({ name, emoji: 'A' });
    const pack2 = makePack({ name, emoji: 'B' });
    registerCharacter(pack1);
    registerCharacter(pack2);
    expect(getCharacterPack(name)).toBe(pack2);
    expect(getCharacterEmoji(name)).toBe('B');
  });

  // -- emoji --

  it('getCharacterEmoji returns emoji for registered pack', () => {
    const pack = makePack({ emoji: '@' });
    registerCharacter(pack);
    expect(getCharacterEmoji(pack.name)).toBe('@');
  });

  it('getCharacterEmoji returns "?" for unknown name', () => {
    expect(getCharacterEmoji('unknown_emoji_test')).toBe('?');
  });

  // -- customEyes --

  it('hasCustomEyes returns true when pack.customEyes is true', () => {
    const pack = makePack({ customEyes: true });
    registerCharacter(pack);
    expect(hasCustomEyes(pack.name)).toBe(true);
  });

  it('hasCustomEyes returns false for unknown name', () => {
    expect(hasCustomEyes('unknown_eyes_test')).toBe(false);
  });

  // -- splatShape --

  it('getCharacterSplatShape returns the pack splatShape', () => {
    const pack = makePack({ splatShape: 'star' });
    registerCharacter(pack);
    expect(getCharacterSplatShape(pack.name)).toBe('star');
  });

  it('getCharacterSplatShape returns "circle" for unknown name', () => {
    expect(getCharacterSplatShape('unknown_splat_test')).toBe('circle');
  });

  // -- gibs --

  it('getCharacterGibs returns the gibs array from the pack', () => {
    const gibs = [
      { gibType: 'ear' as const, width: 10, height: 8 },
      { gibType: 'tail' as const, width: 12, height: 6 },
    ];
    const pack = makePack({ gibs });
    registerCharacter(pack);
    expect(getCharacterGibs(pack.name)).toBe(gibs);
  });

  it('getCharacterGibs returns undefined for unknown name', () => {
    expect(getCharacterGibs('unknown_gibs_test')).toBeUndefined();
  });

  // -- displayName with language fallback --

  it('getCharacterDisplayName returns translation for requested language', () => {
    const pack = makePack({
      translations: { en: 'TestBun', cs: 'TestovyZajic' },
    });
    registerCharacter(pack);
    expect(getCharacterDisplayName(pack.name, 'cs')).toBe('TestovyZajic');
  });

  it('getCharacterDisplayName falls back to English when lang missing', () => {
    const pack = makePack({
      translations: { en: 'EnglishName' },
    });
    registerCharacter(pack);
    expect(getCharacterDisplayName(pack.name, 'fr')).toBe('EnglishName');
  });

  it('getCharacterDisplayName falls back to pack.name when translations undefined', () => {
    const pack = makePack({ translations: undefined });
    registerCharacter(pack);
    expect(getCharacterDisplayName(pack.name, 'en')).toBe(pack.name);
  });

  it('getCharacterDisplayName returns raw name for unknown character', () => {
    expect(getCharacterDisplayName('totally_unknown_char', 'en')).toBe('totally_unknown_char');
  });

  // -- sprite/gib renderer fallback --

  it('getSpriteRenderer returns pack drawSprite for registered character', () => {
    const customRenderer: CharacterRenderer = () => {};
    const pack = makePack({ drawSprite: customRenderer });
    registerCharacter(pack);
    expect(getSpriteRenderer(pack.name)).toBe(customRenderer);
  });

  it('getSpriteRenderer returns fallback for unknown character', () => {
    expect(getSpriteRenderer('unknown_sprite_test')).toBe(fallbackSpriteRenderer);
  });

  it('getGibRenderer returns pack drawGib for registered character', () => {
    const customGib: GibRenderer = () => {};
    const pack = makePack({ drawGib: customGib });
    registerCharacter(pack);
    expect(getGibRenderer(pack.name)).toBe(customGib);
  });

  it('getGibRenderer returns fallback for unknown character', () => {
    expect(getGibRenderer('unknown_gib_test')).toBe(fallbackGibRenderer);
  });

  // -- getAllCharacterDefs --

  it('getAllCharacterDefs includes a registered pack with correct fields', () => {
    const pack = makePack({
      color: '#F00',
      darkColor: '#900',
      lightColor: '#F99',
    });
    registerCharacter(pack);

    const defs = getAllCharacterDefs();
    const match = defs.find(d => d.name === pack.name);
    expect(match).toBeDefined();
    expect(match!.slot).toBe('P1');
    expect(match!.color).toBe('#F00');
    expect(match!.darkColor).toBe('#900');
    expect(match!.lightColor).toBe('#F99');
  });

  it('getAllCharacterDefs returns an entry for every registered pack', () => {
    // Register two more unique packs and verify they appear
    const packA = makePack();
    const packB = makePack();
    registerCharacter(packA);
    registerCharacter(packB);

    const defs = getAllCharacterDefs();
    const names = defs.map(d => d.name);
    expect(names).toContain(packA.name);
    expect(names).toContain(packB.name);
  });
});
