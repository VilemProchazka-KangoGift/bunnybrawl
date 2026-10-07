import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Meadow backdrop preload', () => {
  it('reuses the lobby fetch and decodes only once for concurrent match requests', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['image']) }));
    const bitmap = { width: 1280, height: 720 } as ImageBitmap;
    const decodeMock = vi.fn(async () => bitmap);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', decodeMock);

    const art = await import('./meadowBackdropAsset');
    await Promise.all([art.prefetchMeadowBackdrop(), art.prefetchMeadowBackdrop()]);
    await Promise.all([art.preloadMeadowBackdrop(), art.preloadMeadowBackdrop()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeMock).toHaveBeenCalledTimes(1);
    expect(art.getMeadowBackdrop()).toBe(bitmap);
  });

  it('recovers from a failed speculative fetch when the match starts', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, blob: async () => new Blob(['image']) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1280 } as ImageBitmap)));

    const art = await import('./meadowBackdropAsset');
    await art.prefetchMeadowBackdrop();
    expect(art.getMeadowBackdrop()).toBeNull();
    await art.preloadMeadowBackdrop();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(art.getMeadowBackdrop()).not.toBeNull();
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

    const art = await import('./meadowBackdropAsset');
    const speculative = art.prefetchMeadowBackdrop(controller.signal);
    const actual = art.preloadMeadowBackdrop();
    controller.abort();
    await Promise.all([speculative, actual]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(art.getMeadowBackdrop()).not.toBeNull();
  });
});
