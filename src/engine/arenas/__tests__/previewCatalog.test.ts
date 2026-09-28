import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

describe('arena preview catalog', () => {
  it('provides the playable picker before full packs are registered', async () => {
    const catalog = await import('../previewCatalog');
    const registry = await import('../registry');

    expect(registry.getArenaPack('meadow')).toBeUndefined();
    expect(catalog.listPlayableArenaPreviews().map(preview => preview.id)).toEqual([
      'meadow', 'winter_lake', 'volcano', 'castle', 'candy_land', 'treetops',
      'underwater', 'haunted_graveyard', 'rooftops', 'space_station', 'waterfall',
    ]);
    expect(catalog.getArenaPreviewDisplayName('meadow', 'cs')).toBe('Louka');
    expect(catalog.getArenaPreviewDisplayName('meadow', 'unknown')).toBe('Meadow');
    expect(catalog.getArenaPreviewDisplayName('unknown', 'en')).toBe('unknown');
  });

  it('keeps the picker metadata and order equal to registered builtins', async () => {
    const { registerBuiltinArenas } = await import('../builtin');
    registerBuiltinArenas();
    const catalog = await import('../previewCatalog');
    const registry = await import('../registry');

    expect(catalog.listPlayableArenaPreviews().map(({ id, previewGradient, previewIcon, translations }) => ({
      id, previewGradient, previewIcon, translations,
    }))).toEqual(registry.listPlayableArenaPacks());
    expect(Object.values(catalog.BUILTIN_ARENA_PREVIEWS).map(preview => preview.id))
      .toEqual(registry.listArenaPacks().map(pack => pack.id));
  });

  it('adds custom previews on registration and honors later visibility changes', async () => {
    const { registerBuiltinArenas } = await import('../builtin');
    registerBuiltinArenas();
    const catalog = await import('../previewCatalog');
    const registry = await import('../registry');
    const custom = {
      ...registry.getArenaPackOrThrow('meadow'),
      id: 'custom',
      previewIcon: 'X',
      translations: { en: 'Custom', cs: 'Vlastní' },
    };

    registry.registerArena(custom);
    expect(catalog.listPlayableArenaPreviews().find(preview => preview.id === 'custom'))
      .toMatchObject({ previewIcon: 'X' });
    expect(catalog.getArenaPreviewDisplayName('custom', 'cs')).toBe('Vlastní');
    registry.registerArena({ ...custom, playable: false });
    expect(catalog.listPlayableArenaPreviews().some(preview => preview.id === 'custom')).toBe(false);
  });
});
