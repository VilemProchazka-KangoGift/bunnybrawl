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

// Winter's platform sprites live with the arena art but use the same
// speculative fetch / worker-local decode lifecycle as the backdrop.
const winterPlatformArt = {
  shelf: createBackdrop(new URL('./assets/winter-shelf-painted.webp', import.meta.url).href),
  bridge: createBackdrop(new URL('./assets/winter-bridge-painted.webp', import.meta.url).href),
  cube: createBackdrop(new URL('./assets/winter-cube-painted.webp', import.meta.url).href),
};

const winterPropArt = {
  leafy: createBackdrop(new URL('./assets/winter-bush-leafy.webp', import.meta.url).href),
  hedge: createBackdrop(new URL('./assets/winter-bush-hedge.webp', import.meta.url).href),
  igloo: createBackdrop(new URL('./assets/winter-igloo.webp', import.meta.url).href),
};

// The SVG masters are kept in the castle prop study. Browser workers cannot
// decode SVG Blobs with createImageBitmap, so runtime uses transparent WebP
// renders of those traced paths at several times their displayed size.
const castlePropArt = {
  guard: createBackdrop(new URL('./assets/castle-guard-cartoon.webp', import.meta.url).href),
  sconce: createBackdrop(new URL('./assets/castle-sconce-cartoon.webp', import.meta.url).href),
  chandelier: createBackdrop(new URL('./assets/castle-chandelier-cartoon.webp', import.meta.url).href),
  column: createBackdrop(new URL('./assets/castle-column-cartoon.webp', import.meta.url).href),
};

export function getCastlePropArt(): { guard: ImageBitmap | null; sconce: ImageBitmap | null; chandelier: ImageBitmap | null; column: ImageBitmap | null } {
  return {
    guard: castlePropArt.guard.get(), sconce: castlePropArt.sconce.get(),
    chandelier: castlePropArt.chandelier.get(), column: castlePropArt.column.get(),
  };
}

export function getWinterPropArt(): { leafy: ImageBitmap | null; hedge: ImageBitmap | null; igloo: ImageBitmap | null } {
  return {
    leafy: winterPropArt.leafy.get(),
    hedge: winterPropArt.hedge.get(),
    igloo: winterPropArt.igloo.get(),
  };
}

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
  if (arenaId === 'castle') {
    return Promise.all([backdrops.castle.prefetch(signal), ...Object.values(castlePropArt).map(asset => asset.prefetch(signal))]).then(() => {});
  }
  if (arenaId === 'winter_lake') {
    return Promise.all([backdrops[arenaId].prefetch(signal), ...Object.values(winterPropArt).map(asset => asset.prefetch(signal))]).then(() => {});
  }
  return backdrops[arenaId].prefetch(signal);
}

export function preloadIllustratedBackdrop(arenaId: string): Promise<void> {
  if (!hasIllustratedBackdrop(arenaId)) return Promise.resolve();
  if (arenaId === 'castle') {
    return Promise.all([backdrops.castle.preload(), ...Object.values(castlePropArt).map(asset => asset.preload())]).then(() => {});
  }
  if (arenaId === 'winter_lake') {
    return Promise.all([backdrops[arenaId].preload(), ...Object.values(winterPropArt).map(asset => asset.preload())]).then(() => {});
  }
  return backdrops[arenaId].preload();
}

export function getIllustratedBackdrop(arenaId: string): ImageBitmap | null {
  return hasIllustratedBackdrop(arenaId) ? backdrops[arenaId].get() : null;
}
