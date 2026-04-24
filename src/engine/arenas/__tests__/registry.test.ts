import { describe, it, expect, beforeAll } from 'vitest';
import type { ArenaPack } from '../types';
import {
  registerArena,
  getArenaPack,
  getArenaPackOrThrow,
  getArenaNav,
  getArenaDisplayName,
  listArenaPacks,
  toArena,
  toThemeConfig,
} from '../registry';
import { registerBuiltinArenas } from '../builtin';

// Builtins are registered once for the whole suite (module-scoped Map).
beforeAll(() => {
  registerBuiltinArenas();
});

// ---------------------------------------------------------------------------
// Minimal mock factory — only fills required ArenaPack fields.
// ---------------------------------------------------------------------------
const noop = () => {};

function makeMockPack(overrides: Partial<ArenaPack> & { id: string }): ArenaPack {
  return {
    previewGradient: 'linear-gradient(#000,#111)',
    previewIcon: 'T',
    translations: { en: 'Test Arena' },
    width: 1280,
    height: 720,
    platforms: [{ x: 0, y: 680, width: 1280, height: 40 }],
    spawnPoints: [{ x: 200, y: 650, platformIndex: 0 }],
    sky: { gradient: [{ offset: 0, color: '#000' }, { offset: 1, color: '#111' }] },
    hills: [],
    ground: { surfaceColor: '#555', surfaceThickness: 4 },
    platform: {
      floatingBodyColor: '#444',
      floatingTopColor: '#666',
      groundBodyColor: '#333',
      groundTopColor: '#555',
      drawMoss: false,
    },
    clouds: { count: 0, color: '#fff', minSize: 10, maxSize: 20, minSpeed: 0.1, maxSpeed: 0.3, yRange: [0, 100] },
    weather: { particleCount: 0, types: [] },
    wildlife: { count: 0, types: [] },
    fog: { count: 0, baseY: 600, color: '#fff', alpha: 0 },
    ambientParticles: { count: 0, types: [] },
    dayNight: { enabled: false },
    drawBackgroundNature: noop as ArenaPack['drawBackgroundNature'],
    drawForegroundNature: noop as ArenaPack['drawForegroundNature'],
    ...overrides,
  } as ArenaPack;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Arena registry', () => {

  // -- registerArena / getArenaPack --

  it('registers and retrieves a custom arena pack', () => {
    const pack = makeMockPack({ id: 'test_register_1' });
    registerArena(pack);

    const retrieved = getArenaPack('test_register_1');
    expect(retrieved).toBe(pack);
  });

  it('returns undefined for an unregistered id', () => {
    expect(getArenaPack('nonexistent_arena_xyz')).toBeUndefined();
  });

  // -- getArenaPackOrThrow --

  it('throws for an unknown arena id', () => {
    expect(() => getArenaPackOrThrow('no_such_arena')).toThrowError('Unknown arena: no_such_arena');
  });

  it('returns the pack for a known arena id', () => {
    const pack = makeMockPack({ id: 'test_or_throw' });
    registerArena(pack);
    expect(getArenaPackOrThrow('test_or_throw')).toBe(pack);
  });

  // -- navData auto-registration --

  it('auto-registers navData when present on the pack', () => {
    const navData = {
      edges: [[]],
      nextHop: [[0]],
      safeHop: [[0]],
    };
    const pack = makeMockPack({ id: 'test_nav_auto', navData });
    registerArena(pack);

    expect(getArenaNav('test_nav_auto')).toBe(navData);
  });

  it('does not register navData when absent', () => {
    const pack = makeMockPack({ id: 'test_nav_absent' });
    // Explicitly ensure navData is undefined
    delete (pack as Record<string, unknown>).navData;
    registerArena(pack);

    expect(getArenaNav('test_nav_absent')).toBeUndefined();
  });

  // -- getArenaDisplayName --

  it('returns the translated name for the requested language', () => {
    const pack = makeMockPack({
      id: 'test_display_name',
      translations: { en: 'English Name', cs: 'Czech Name', hi: 'Hindi Name' },
    });
    registerArena(pack);

    expect(getArenaDisplayName('test_display_name', 'cs')).toBe('Czech Name');
    expect(getArenaDisplayName('test_display_name', 'hi')).toBe('Hindi Name');
  });

  it('falls back to English when requested language is missing', () => {
    const pack = makeMockPack({
      id: 'test_display_fallback_en',
      translations: { en: 'English Fallback' },
    });
    registerArena(pack);

    expect(getArenaDisplayName('test_display_fallback_en', 'fr')).toBe('English Fallback');
  });

  it('falls back to raw id when both requested language and English are missing', () => {
    const pack = makeMockPack({
      id: 'test_display_fallback_id',
      translations: { cs: 'Czech Only' },
    });
    registerArena(pack);

    expect(getArenaDisplayName('test_display_fallback_id', 'fr')).toBe('test_display_fallback_id');
  });

  it('returns raw id for a completely unknown arena', () => {
    expect(getArenaDisplayName('totally_unknown_arena', 'en')).toBe('totally_unknown_arena');
  });

  // -- listArenaPacks --

  it('lists all registered packs including builtins and custom', () => {
    // We registered builtins (11) + several test packs above.
    const list = listArenaPacks();

    // At minimum the 11 builtins must be present
    expect(list.length).toBeGreaterThanOrEqual(11);

    // Each entry has the expected shape
    for (const entry of list) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('previewGradient');
      expect(entry).toHaveProperty('previewIcon');
      expect(entry).toHaveProperty('translations');
      expect(typeof entry.id).toBe('string');
    }

    // Verify a known builtin is in the list
    const meadow = list.find(e => e.id === 'meadow');
    expect(meadow).toBeDefined();
    expect(meadow!.translations.en).toBe('Meadow');
  });

  // -- toArena extractor --

  it('extracts Arena shape from an ArenaPack', () => {
    const pack = makeMockPack({
      id: 'test_to_arena',
      translations: { en: 'My Arena' },
      hazardZones: [{ x: 0, y: 600, width: 100, height: 40, type: 'lava' as const }],
      allowFallOff: true,
      noSprings: true,
    });
    registerArena(pack);

    const arena = toArena(pack);

    expect(arena.id).toBe('test_to_arena');
    expect(arena.name).toBe('My Arena');
    expect(arena.themeId).toBe('test_to_arena');
    expect(arena.width).toBe(1280);
    expect(arena.height).toBe(720);
    expect(arena.platforms).toBe(pack.platforms);
    expect(arena.spawnPoints).toBe(pack.spawnPoints);
    expect(arena.hazardZones).toBe(pack.hazardZones);
    expect(arena.allowFallOff).toBe(true);
    expect(arena.noSprings).toBe(true);
    // Should NOT carry over visual fields
    expect((arena as Record<string, unknown>).sky).toBeUndefined();
    expect((arena as Record<string, unknown>).drawBackgroundNature).toBeUndefined();
  });

  it('toArena uses pack id when English translation is missing', () => {
    const pack = makeMockPack({
      id: 'test_to_arena_no_en',
      translations: { cs: 'Only Czech' },
    });

    const arena = toArena(pack);
    expect(arena.name).toBe('test_to_arena_no_en');
  });

  // -- toThemeConfig extractor --

  it('extracts ThemeConfig shape from an ArenaPack', () => {
    const drawBg = () => {};
    const drawFg = () => {};
    const drawPlat = () => {};
    const pack = makeMockPack({
      id: 'test_to_theme',
      drawBackgroundNature: drawBg as ArenaPack['drawBackgroundNature'],
      drawForegroundNature: drawFg as ArenaPack['drawForegroundNature'],
      drawPlatform: drawPlat as ArenaPack['drawPlatform'],
      bubbleHelmet: true,
      physics: { gravity: 1.5 },
    });
    registerArena(pack);

    const theme = toThemeConfig(pack);

    expect(theme.id).toBe('test_to_theme');
    expect(theme.nameKey).toBe('arena_test_to_theme');
    expect(theme.previewGradient).toBe(pack.previewGradient);
    expect(theme.previewIcon).toBe(pack.previewIcon);
    expect(theme.sky).toBe(pack.sky);
    expect(theme.drawBackgroundNature).toBe(drawBg);
    expect(theme.drawForegroundNature).toBe(drawFg);
    expect(theme.drawPlatform).toBe(drawPlat);
    expect(theme.bubbleHelmet).toBe(true);
    expect(theme.physics).toEqual({ gravity: 1.5 });
    // Should NOT carry over layout fields
    expect((theme as Record<string, unknown>).platforms).toBeUndefined();
    expect((theme as Record<string, unknown>).spawnPoints).toBeUndefined();
    expect((theme as Record<string, unknown>).width).toBeUndefined();
  });
});
