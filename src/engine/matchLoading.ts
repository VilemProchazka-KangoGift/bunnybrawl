import { audio } from './audio';
import type { Arena } from './types';
import type { IRenderer } from './renderer';
import type { NetMatch } from './net';

/**
 * Minimum visible duration for the loading overlay. Prevents a blink-and-miss
 * screen when everything preloads fast (cached arena, local assets).
 */
const DEFAULT_MIN_MS = 400;

/**
 * Hard cap on total loading time. If any task hangs (network stall, etc.),
 * the returned promise rejects so callers can fall back to starting the match
 * without the preloaded asset.
 */
const DEFAULT_TIMEOUT_MS = 15000;

export interface RunLoadingTasksOpts {
  arenaId: string;
  characterNames: string[];
  renderer: IRenderer;
  arena: Arena;
  originalArena: Arena;
  /** When set, guests wait for the snapshot stream to warm up before the
   *  loading screen lifts. No-op on host. */
  netMatch?: NetMatch | null;
  minDurationMs?: number;
  timeoutMs?: number;
}

/**
 * Kick off parallel async tasks needed before a match can start, resolving when
 * they all complete OR when `timeoutMs` elapses (rejects with `loading_timeout`).
 *
 * Tasks:
 * 1. Music preload — streams the arena MP3 so `playMusic()` starts instantly.
 * 2. Background render — paints the static bg layer (hills, ground, platforms)
 *    so the first visible frame is fully drawn.
 * 3. Sprite cache warmup — pre-renders each active character's common
 *    (state, animFrame) combinations to the sprite cache so the first
 *    visible frame doesn't hitch on OffscreenCanvas creation.
 *
 * A minimum duration (`minDurationMs`) ensures the loading overlay is on screen
 * long enough to be perceived even when all tasks finish instantly.
 */
export async function runLoadingTasks(opts: RunLoadingTasksOpts): Promise<void> {
  const minMs = opts.minDurationMs ?? DEFAULT_MIN_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // The lobby→match flow has no setPaused/visibility transition, so resume
  // here covers idle-in-lobby auto-suspend before the first SFX fires.
  audio.resumeContext();

  const minDelay = new Promise<void>((resolve) => setTimeout(resolve, minMs));

  const musicTask = audio.preloadArena(opts.arenaId);

  // Yield to the next tick so the loading overlay paints before we block on
  // the (synchronous, potentially slow) background render.
  const backgroundTask = new Promise<void>((resolve) => {
    setTimeout(() => {
      opts.renderer.renderBackground(opts.arena, opts.originalArena);
      resolve();
    }, 0);
  });

  const spriteTask = new Promise<void>((resolve) => {
    setTimeout(() => {
      opts.renderer.warmSpriteCache(opts.characterNames);
      resolve();
    }, 0);
  });

  // Guest-only snapshot stream warm-up. Resolves on success or graceful
  // timeout — never rejects, so a flaky network can't stall match start.
  const networkTask = opts.netMatch?.waitForGuestNetworkReady() ?? Promise.resolve();

  const allTasks = Promise.all([musicTask, backgroundTask, spriteTask, networkTask, minDelay]);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('loading_timeout')), timeoutMs);
  });
  try {
    await Promise.race([allTasks, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  // Verification pass — the individual tasks can be superseded mid-flight
  // (e.g. a concurrent arena swap reassigning MusicManager's in-flight preload
  // target). Re-check the observable state and heal any gaps so the loading
  // screen never hides while the asset it was supposed to prepare isn't ready.
  // Each pass is cheap when the work is already done: preloadArena early-
  // returns on same-theme cache hit, warmSpriteCache hits the OffscreenCanvas
  // cache for previously-drawn sprites.
  if (!audio.hasPreloadedArena(opts.arenaId)) {
    try { await audio.preloadArena(opts.arenaId); } catch { /* never block startup */ }
  }
  if (!opts.renderer.hasWarmedAll(opts.characterNames)) {
    opts.renderer.warmSpriteCache(opts.characterNames);
  }
}

