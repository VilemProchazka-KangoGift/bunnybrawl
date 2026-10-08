// Kept outside packs/ so menu and lobby can fetch selected art without loading
// every arena. Each canvas-owning worker decodes its own copy of the cached URL.
const urls = {
  meadow: new URL('./assets/meadow-low-valley.webp', import.meta.url).href,
  winter_lake: new URL('./assets/winter-lake-pearl-painted.webp', import.meta.url).href,
} as const;

type IllustratedArena = keyof typeof urls;

function createBackdrop(url: string) {
  let blobPromise: Promise<Blob> | undefined;
  let bitmapPromise: Promise<void> | undefined;
  let bitmap: ImageBitmap | null = null;

  function fetchBlob(signal?: AbortSignal): Promise<Blob> {
    blobPromise ??= fetch(url, { signal }).then(response => {
      if (!response.ok) throw new Error(`Illustrated backdrop failed: HTTP ${response.status}`);
      return response.blob();
    }).catch(error => {
      blobPromise = undefined;
      throw error;
    });
    return blobPromise;
  }

  return {
    prefetch(signal?: AbortSignal): Promise<void> {
      return fetchBlob(signal).then(() => {}).catch(() => {
        // Speculative failures remain retryable at match start.
      });
    },
    preload(): Promise<void> {
      if (bitmap) return Promise.resolve();
      bitmapPromise ??= fetchBlob().catch(() => fetchBlob()).then(blob => createImageBitmap(blob)).then(image => {
        bitmap = image;
      }).catch(() => {
        bitmapPromise = undefined;
        // Optional image failure falls back to the procedural scene.
      });
      return bitmapPromise;
    },
    get(): ImageBitmap | null { return bitmap; },
  };
}

const backdrops = {
  meadow: createBackdrop(urls.meadow),
  winter_lake: createBackdrop(urls.winter_lake),
};

// Winter's platform sprites live with the arena art but use the same
// speculative fetch / worker-local decode lifecycle as the backdrop.
const winterPlatformArt = {
  shelf: createBackdrop(new URL('./assets/winter-shelf-painted.webp', import.meta.url).href),
  bridge: createBackdrop(new URL('./assets/winter-bridge-painted.webp', import.meta.url).href),
  cube: createBackdrop(new URL('./assets/winter-cube-painted.webp', import.meta.url).href),
};

export function getWinterPlatformArt(): {
  shelf: ImageBitmap | null; bridge: ImageBitmap | null; cube: ImageBitmap | null;
} {
  return {
    shelf: winterPlatformArt.shelf.get(),
    bridge: winterPlatformArt.bridge.get(),
    cube: winterPlatformArt.cube.get(),
  };
}

// Retained for painted-art comparisons. The playable vector platforms no
// longer need these three images in menu/lobby prefetch or match startup.
export function prefetchWinterPlatformArt(signal?: AbortSignal): Promise<void> {
  return Promise.all(Object.values(winterPlatformArt).map(asset => asset.prefetch(signal))).then(() => {});
}

export function preloadWinterPlatformArt(): Promise<void> {
  return Promise.all(Object.values(winterPlatformArt).map(asset => asset.preload())).then(() => {});
}

export function hasIllustratedBackdrop(arenaId: string): arenaId is IllustratedArena {
  return Object.hasOwn(backdrops, arenaId);
}

export function prefetchIllustratedBackdrop(arenaId: string, signal?: AbortSignal): Promise<void> {
  if (!hasIllustratedBackdrop(arenaId)) return Promise.resolve();
  return backdrops[arenaId].prefetch(signal);
}

export function preloadIllustratedBackdrop(arenaId: string): Promise<void> {
  if (!hasIllustratedBackdrop(arenaId)) return Promise.resolve();
  return backdrops[arenaId].preload();
}

export function getIllustratedBackdrop(arenaId: string): ImageBitmap | null {
  return hasIllustratedBackdrop(arenaId) ? backdrops[arenaId].get() : null;
}
