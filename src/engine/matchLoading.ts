import { audio } from './audio';
import type { Arena } from './types';
import type { Renderer } from './renderer';

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
  renderer: Renderer;
  arena: Arena;
  originalArena: Arena;
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
      warmSpriteCache(opts.renderer, opts.characterNames);
      resolve();
    }, 0);
  });

  const allTasks = Promise.all([musicTask, backgroundTask, spriteTask, minDelay]);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('loading_timeout')), timeoutMs);
  });
  try {
    await Promise.race([allTasks, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function warmSpriteCache(renderer: Renderer, names: string[]): void {
  renderer.warmSpriteCache(names);
}
