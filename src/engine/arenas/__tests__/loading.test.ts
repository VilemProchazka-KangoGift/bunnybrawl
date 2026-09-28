import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

it('loads the lobby without registering match arenas', async () => {
  const { loadLobbyArena } = await import('../loading');
  const registry = await import('../registry');
  await loadLobbyArena();

  expect(registry.getArenaPackOrThrow('lobby').playable).toBe(false);
  expect(registry.getArenaPack('meadow')).toBeUndefined();
  expect(registry.listArenaPacks().map(pack => pack.id)).toEqual(['lobby']);
});

it('registers every match pack and its navigation data before the load resolves', async () => {
  const { loadBuiltinArenas } = await import('../loading');
  const registry = await import('../registry');
  await loadBuiltinArenas();

  expect(registry.listPlayableArenaPacks()).toHaveLength(11);
  expect(registry.getArenaPackOrThrow('meadow').platforms.length).toBeGreaterThan(0);
  expect(registry.getArenaNav('meadow')).toBeDefined();
});
