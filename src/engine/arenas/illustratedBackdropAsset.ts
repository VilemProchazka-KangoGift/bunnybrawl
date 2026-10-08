// Kept outside packs/ so menu and lobby can fetch selected art without loading
// every arena. Each canvas-owning worker decodes its own copy of the cached URL.
const urls = {
  rooftops: new URL('./assets/rooftops-painted.webp', import.meta.url).href,
  treetops: new URL('./assets/treetops-painted.webp', import.meta.url).href,
  waterfall: new URL('./assets/waterfall-painted.webp', import.meta.url).href,
  volcano: new URL('./assets/volcano-painted.webp', import.meta.url).href,
  castle: new URL('./assets/castle-painted.webp', import.meta.url).href,
  haunted_graveyard: new URL('./assets/haunted-graveyard-painted.webp', import.meta.url).href,
  candy_land: new URL('./assets/candy-land-painted.webp', import.meta.url).href,
  underwater: new URL('./assets/underwater-painted.webp', import.meta.url).href,
  space_station: new URL('./assets/space-station-painted.webp', import.meta.url).href,
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
  rooftops: createBackdrop(urls.rooftops),
  treetops: createBackdrop(urls.treetops),
  waterfall: createBackdrop(urls.waterfall),
  volcano: createBackdrop(urls.volcano),
  castle: createBackdrop(urls.castle),
  haunted_graveyard: createBackdrop(urls.haunted_graveyard),
  candy_land: createBackdrop(urls.candy_land),
  underwater: createBackdrop(urls.underwater),
  space_station: createBackdrop(urls.space_station),
  meadow: createBackdrop(urls.meadow),
  winter_lake: createBackdrop(urls.winter_lake),
};

export function hasIllustratedBackdrop(arenaId: string): arenaId is IllustratedArena {
  return Object.hasOwn(backdrops, arenaId);
}

export function prefetchIllustratedBackdrop(arenaId: string, signal?: AbortSignal): Promise<void> {
  return hasIllustratedBackdrop(arenaId) ? backdrops[arenaId].prefetch(signal) : Promise.resolve();
}

export function preloadIllustratedBackdrop(arenaId: string): Promise<void> {
  return hasIllustratedBackdrop(arenaId) ? backdrops[arenaId].preload() : Promise.resolve();
}

export function getIllustratedBackdrop(arenaId: string): ImageBitmap | null {
  return hasIllustratedBackdrop(arenaId) ? backdrops[arenaId].get() : null;
}
