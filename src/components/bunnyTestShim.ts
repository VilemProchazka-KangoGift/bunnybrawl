/**
 * BunnyTest E2E Diagnostic Shim
 *
 * Single typed surface (`window.__bunnyTest`) for Playwright E2E specs and
 * in-browser debugging. Replaces the ad-hoc `__gameLoop` / `__netMatch` /
 * `__gameStore` globals + dotted GameLoop diagnostic methods that used to
 * leak into the public API just for tests.
 *
 * Lifecycle:
 *   - `mountStore(gameStore)` — called once from gameStore.ts at module load.
 *     Mounts `window.__bunnyTest` so lobby / menu tests can read gameStore
 *     state before any Match is open.
 *   - `attachMatch({ gameLoopRef, netMatchRef })` — Match.tsx calls in the
 *     mount effect; returned `detach()` clears the refs on unmount.
 *
 * Function-getter form (not eager fields) so each call reads CURRENT state —
 * GameLoop / NetMatch references can be replaced mid-session (rematch,
 * arena change, host/guest swap).
 *
 * Mount gate: always-on (matches the legacy `window.__gameLoop` mount, which
 * was unconditional). Playwright runs against production builds, so a
 * DEV-only gate would break E2E. The cost of an always-mounted surface in
 * production is negligible (a single object literal with seven closures).
 */

import type { GameLoop } from '../engine/gameLoop';
import type { NetMatch } from '../engine/net/netMatch';
import type { MatchState } from '../engine/types';
import type { RenderDiagnostics } from '../engine/renderer';
import type { HostDebugStats } from '../engine/net/hostAuthority';
import type { useGameStore } from '../store/gameStore';

/**
 * Zustand store handle — `useBoundStore` is itself a function with
 * `getState`/`setState`/`subscribe`. We expose the same shape tests already
 * relied on via `window.__gameStore`.
 */
type GameStoreApi = typeof useGameStore;

/** Lazy reference container — Match.tsx already keeps refs of this shape. */
export interface ReadonlyRef<T> { readonly current: T | null }

export interface AttachMatchDeps {
  gameLoopRef: ReadonlyRef<GameLoop>;
  netMatchRef: ReadonlyRef<NetMatch>;
}

export interface BunnyTestSnapshot {
  /** Current MatchState, or undefined if no GameLoop is mounted. */
  state(): MatchState | undefined;
  /** Renderer diagnostics counters (lighting, particles, etc.). */
  diagnostics(): RenderDiagnostics | undefined;
  /** Auto-slow detector flipped flag (perf budget breach). */
  autoSlowFlipped(): boolean;
  /** Zustand store API — same shape as the bound hook. */
  gameStore(): GameStoreApi | undefined;
  /** Active NetMatch (online only). */
  netMatch(): NetMatch | undefined;
  /** Convenience: net stats / undefined if no active NetMatch. */
  netStats(): HostDebugStats | null | undefined;
  /** Latest snapshot frame number (online perf testing). */
  latestSnapshotFrame(): number | undefined;
  /** Escape hatch: raw GameLoop for tests that need to call stop() / pause()
   *  / etc. directly (lighting screenshot tests freeze the RAF loop). Prefer
   *  the typed accessors above; this is a last resort. */
  gameLoop(): GameLoop | undefined;
}

declare global {
  interface Window {
    __bunnyTest?: BunnyTestSnapshot;
  }
}

// Module-scope state. The snapshot uses function-getter form, so refs can
// be swapped without rebuilding the snapshot object.
let storeRef: GameStoreApi | null = null;
let gameLoopRef: ReadonlyRef<GameLoop> | null = null;
let netMatchRef: ReadonlyRef<NetMatch> | null = null;

function getGameLoop(): GameLoop | null { return gameLoopRef?.current ?? null; }
function getNetMatch(): NetMatch | null { return netMatchRef?.current ?? null; }

function ensureMounted(): void {
  if (typeof window === 'undefined') return;
  if (window.__bunnyTest) return;
  window.__bunnyTest = {
    state: () => getGameLoop()?.getState(),
    diagnostics: () => getGameLoop()?.getRendererDiagnostics(),
    autoSlowFlipped: () => getGameLoop()?.isAutoSlowFlipped() ?? false,
    gameStore: () => storeRef ?? undefined,
    netMatch: () => getNetMatch() ?? undefined,
    netStats: () => getNetMatch()?.getDebugStats(),
    latestSnapshotFrame: () => getNetMatch()?.getLatestSnapshotFrame(),
    gameLoop: () => getGameLoop() ?? undefined,
  };
}

/**
 * Mount the gameStore handle on the shim. Called once from gameStore.ts at
 * module load so lobby/menu E2E specs see `__bunnyTest.gameStore()` before
 * any Match is open.
 */
export function mountStore(store: GameStoreApi): void {
  storeRef = store;
  ensureMounted();
}

/**
 * Attach Match-scoped refs (GameLoop, NetMatch). Match.tsx calls this in
 * its mount effect; returned `detach()` clears the refs on unmount.
 */
export function attachMatch(deps: AttachMatchDeps): () => void {
  if (typeof window === 'undefined') return () => {};
  gameLoopRef = deps.gameLoopRef;
  netMatchRef = deps.netMatchRef;
  ensureMounted();
  return () => {
    if (gameLoopRef === deps.gameLoopRef) gameLoopRef = null;
    if (netMatchRef === deps.netMatchRef) netMatchRef = null;
  };
}
