// Kept outside packs/ so the menu can fetch the selected arena's art without
// importing every arena pack before its first paint. Each worker has its own
// module instance and decodes the same cached URL in its rendering realm.
const backdropUrl = new URL('./assets/meadow-low-valley.webp', import.meta.url).href;

let blobPromise: Promise<Blob> | undefined;
let bitmapPromise: Promise<void> | undefined;
let bitmap: ImageBitmap | null = null;

function fetchBlob(signal?: AbortSignal): Promise<Blob> {
  blobPromise ??= fetch(backdropUrl, { signal }).then(response => {
    if (!response.ok) throw new Error(`Meadow backdrop failed: HTTP ${response.status}`);
    return response.blob();
  }).catch(error => {
    blobPromise = undefined;
    throw error;
  });
  return blobPromise;
}

/** Fetch the tiny encoded asset after menu paint or while the lobby is open. */
export function prefetchMeadowBackdrop(signal?: AbortSignal): Promise<void> {
  return fetchBlob(signal).then(() => {}).catch(() => {
    // Speculative failures remain retryable at match start.
  });
}

/** Decode in the realm that owns the canvas. A missing image uses vector art. */
export function preloadMeadowBackdrop(): Promise<void> {
  if (bitmap) return Promise.resolve();
  bitmapPromise ??= fetchBlob().catch(() => fetchBlob()).then(blob => createImageBitmap(blob)).then(image => {
    bitmap = image;
  }).catch(() => {
    bitmapPromise = undefined;
    // Keep gameplay available when the optional background cannot load.
  });
  return bitmapPromise;
}

export function getMeadowBackdrop(): ImageBitmap | null {
  return bitmap;
}
