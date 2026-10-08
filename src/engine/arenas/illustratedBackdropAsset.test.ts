import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('illustrated arena backdrop preload', () => {
  it('reuses the lobby fetch and decodes only once for concurrent match requests', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['image']) }));
    const bitmap = { width: 1280, height: 720 } as ImageBitmap;
    const decodeMock = vi.fn(async () => bitmap);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', decodeMock);

    const art = await import('./illustratedBackdropAsset');
    await Promise.all([art.prefetchIllustratedBackdrop('meadow'), art.prefetchIllustratedBackdrop('meadow')]);
    await Promise.all([art.preloadIllustratedBackdrop('meadow'), art.preloadIllustratedBackdrop('meadow')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeMock).toHaveBeenCalledTimes(1);
    expect(art.getIllustratedBackdrop('meadow')).toBe(bitmap);
  });

  it('recovers from a failed speculative fetch when the match starts', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, blob: async () => new Blob(['image']) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1280 } as ImageBitmap)));

    const art = await import('./illustratedBackdropAsset');
    await art.prefetchIllustratedBackdrop('meadow');
    expect(art.getIllustratedBackdrop('meadow')).toBeNull();
    await art.preloadIllustratedBackdrop('meadow');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(art.getIllustratedBackdrop('meadow')).not.toBeNull();
  });

  it('retries when Online cancels the menu fetch during match startup', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, options?: { signal?: AbortSignal }) => {
      if (!options?.signal) return Promise.resolve({ ok: true, blob: async () => new Blob(['image']) });
      return new Promise((_, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('canceled', 'AbortError')), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1280 } as ImageBitmap)));

    const art = await import('./illustratedBackdropAsset');
    const speculative = art.prefetchIllustratedBackdrop('meadow', controller.signal);
    const actual = art.preloadIllustratedBackdrop('meadow');
    controller.abort();
    await Promise.all([speculative, actual]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(art.getIllustratedBackdrop('meadow')).not.toBeNull();
  });

  it('loads Winter Lake separately without fetching an unrelated arena', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['winter']) }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1280 } as ImageBitmap)));

    const art = await import('./illustratedBackdropAsset');
    await art.prefetchIllustratedBackdrop('winter_lake');
    await art.preloadIllustratedBackdrop('winter_lake');
    await art.prefetchIllustratedBackdrop('rooftops');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
      expect.stringContaining('winter-lake-pearl-painted.webp'),
      expect.stringContaining('winter-bush-leafy.webp'),
      expect.stringContaining('winter-bush-hedge.webp'),
      expect.stringContaining('winter-igloo.webp'),
    ]));
    expect(art.getWinterPropArt().igloo).not.toBeNull();
    expect(art.getWinterPlatformArt().cube).toBeNull();
    await art.prefetchWinterPlatformArt();
    await art.preloadWinterPlatformArt();
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
      expect.stringContaining('winter-shelf-painted.webp'),
      expect.stringContaining('winter-bridge-painted.webp'),
      expect.stringContaining('winter-cube-painted.webp'),
    ]));
    expect(art.getWinterPlatformArt().cube).not.toBeNull();
    expect(art.getIllustratedBackdrop('winter_lake')).not.toBeNull();
    expect(art.getIllustratedBackdrop('meadow')).toBeNull();
  });
});
