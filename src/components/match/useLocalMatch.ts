import { useEffect } from 'react';
import { GameLoop } from '../../engine/gameLoop';
import { NetMatch } from '../../engine/net/netMatch';
import { getArena, getTheme } from '../../engine/arenas';
import { perfTrace } from '../../engine/perfTrace';
import * as fpsCounter from '../../engine/fpsCounter';
import { runLoadingTasks } from '../../engine/matchLoading';
import { isWorkerEnabled, RendererProxy } from '../../engine/worker';
import { isSimWorkerEnabled } from '../../engine/worker/simWorkerFlag';
import { EngineWorkerProxy } from '../../engine/worker/EngineWorkerProxy';
import { getRenderScale } from '../../engine/renderScale';
import { debugFlags } from '../../engine/debugFlags';
import i18n from '../../i18n';
import type { TouchInputManager } from '../../engine/touchInput';
import type {
  PlayerSlot, MatchPhase, MatchState, MatchSettings,
} from '../../engine/types';

/** Run loading tasks for a GameLoop, applying a stale-promise guard so a
 *  rapid arena swap can't mis-signal readiness for an outdated arena.
 *  Exported so the online hook + change-arena handler can share it. */
export function kickoffLoading(
  loop: GameLoop,
  isCurrent: () => boolean,
  onReady: () => void,
  netMatch?: NetMatch | null,
): void {
  const startGen = loop.getLoadingGeneration();
  runLoadingTasks({
    arenaId: loop.getArena().themeId,
    characterNames: loop.getActiveCharacterNames(),
    renderer: loop.getRenderer(),
    arena: loop.getArena(),
    originalArena: loop.getOriginalArena(),
    netMatch,
  }).finally(() => {
    if (!isCurrent()) return;
    if (loop.getLoadingGeneration() !== startGen) return;
    onReady();
  });
}

export interface UseLocalMatchParams {
  // Canvas refs (read at effect time, not in deps — same as original).
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  bgNightCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  fgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  fgNightTintRef: React.RefObject<HTMLDivElement | null>;
  lightCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  hudCanvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Lifecycle refs the hook owns/clears.
  gameLoopRef: React.MutableRefObject<GameLoop | null>;
  victoryTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;

  // Inputs into the loop.
  currentArenaId: string;
  activePlayers: PlayerSlot[];
  matchSettings: MatchSettings;

  // Wired-up callbacks the host effect needs.
  setMatchResult: (winner: PlayerSlot | null, state: MatchState, isDisconnect?: boolean) => void;
  setTouchInput: (t: TouchInputManager | null) => void;
  setPhaseIsLoading: (b: boolean) => void;
  setLocalTasksDone: (b: boolean) => void;

  // Toggles between this hook's branch vs useOnlineMatch.
  isOnline: boolean;
}

/**
 * Local-mode lifecycle: constructs a GameLoop bound to the four canvases,
 * wires phase/match-end callbacks, kicks off asset preload, and tears
 * everything down on unmount.
 *
 * Cleanup order (preserved from the original Match.tsx effect):
 *   1. loop.stop()              — RAF cancel + audio teardown
 *   2. gameLoopRef.current = null — drop our reference
 *   3. setTouchInput(null)       — TouchOverlay unmounts
 *   4. clear victoryTimeoutRef   — pending setMatchResult won't fire post-nav
 *
 * IMPORTANT: this effect early-returns when `isOnline === true`. The
 * companion hook `useOnlineMatch` runs in that branch instead. Both effects
 * include `isOnline` in their dep array so a runtime online↔local switch
 * (which would also remount Match because `online.isOnline` shifts) tears
 * the previous instance down before the new one is constructed.
 *
 * IMPORTANT: `currentArenaId` is intentionally NOT in the dep array —
 * arena change is in-place via `gameLoop.switchArena()`. Adding it would
 * trigger a Match remount and drop NetMatch transport wiring on the
 * sibling online effect.
 *
 * The "reset phaseIsLoading=true / localTasksDone=false at top of branch"
 * caveat from CLAUDE.md is preserved here.
 *
 * HMR caveat: editing engine code while a match is running with
 * `?worker=on` updates Match.tsx's transitive deps on main but leaves the
 * worker bundle running the previously-compiled module graph. Vite does
 * not propagate HMR into Web Workers. To pick up engine changes, hard-
 * refresh (Ctrl+Shift+R) or quit-to-menu and re-enter the match — that
 * tears down the proxy via this effect's cleanup and the next mount
 * spawns a fresh worker that fetches the updated bundle. Production is
 * unaffected (no HMR).
 */
export function useLocalMatch(p: UseLocalMatchParams): void {
  const {
    bgCanvasRef, bgNightCanvasRef, fgCanvasRef, fgNightTintRef, lightCanvasRef, hudCanvasRef,
    gameLoopRef, victoryTimeoutRef,
    currentArenaId, activePlayers, matchSettings,
    setMatchResult, setTouchInput,
    setPhaseIsLoading, setLocalTasksDone,
    isOnline,
  } = p;

  useEffect(() => {
    if (isOnline) return; // online hook handles this branch
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    const hudCanvas = hudCanvasRef.current;
    if (!bgCanvas || !fgCanvas || !hudCanvas) return;
    // Optional lighting overlays: when missing, Renderer falls back to the
    // source-over fillRect tint path. Don't block match mount on them.
    const bgNightCanvas = bgNightCanvasRef.current ?? undefined;
    const fgNightTint = fgNightTintRef.current ?? undefined;
    const lightCanvas = lightCanvasRef.current ?? undefined;

    const arena = getArena(currentArenaId);
    let matchEnded = false;
    const onMatchEnd = (winner: PlayerSlot | null, state: MatchState) => {
      if (matchEnded) return;
      matchEnded = true;
      victoryTimeoutRef.current = setTimeout(() => {
        setMatchResult(winner, state);
      }, 1500);
    };

    window.__perfTrace = perfTrace;
    window.__fpsCounter = fpsCounter;

    // Reset overlay state at the top of the local branch — without this a
    // rematch / arena-change would leave stale `false` and the overlay
    // would briefly skip while the new loop boots.
    setPhaseIsLoading(true);
    setLocalTasksDone(false);

    // Worker offload: two stacked flags govern this.
    //   ?simWorker=on (default off) → the worker hosts the FULL GameLoop
    //     (sim + cosmetic + render). Main is a thin keyboard/audio shell.
    //     Local play only — online play has too much NetMatch coupling.
    //   ?worker=on    (default on)  → renderer-only worker. Sim stays on
    //     main; per-frame state ships to worker for paint.
    // Both off → pure main-thread render path (the safe baseline).
    const useSimWorker = isSimWorkerEnabled();
    if (useSimWorker) {
      try {
        const engineProxy = new EngineWorkerProxy({
          bgCanvas, fgCanvas, hudCanvas, bgNightCanvas, fgNightTint, lightCanvas,
          arena, settings: matchSettings, activePlayers,
          onMatchEnd,
          mirrored: matchSettings.mods.mirrorArena,
          renderScale: getRenderScale(),
          language: i18n.language,
          perfEnabled: debugFlags.perfEnabled,
          navDebugEnabled: debugFlags.navDebugEnabled,
          netDebugEnabled: debugFlags.netDebugEnabled,
          fpsEnabled: debugFlags.fpsEnabled,
          onError: (m) => console.error('[engine worker]', m),
        });
        // Type-cast: EngineWorkerProxy implements the GameLoop public
        // surface that Match.tsx + matchLoading + bunnyTestShim use.
        // Not an `extends GameLoop` because the parent constructor has
        // expensive side effects we'd want to skip.
        gameLoopRef.current = engineProxy as unknown as GameLoop;
        engineProxy.setOnPhaseChange((phase) => setPhaseIsLoading(phase === 'loading'));
        engineProxy.start();
        setTouchInput(engineProxy.getTouchInput());
        kickoffLoading(
          engineProxy as unknown as GameLoop,
          () => gameLoopRef.current === (engineProxy as unknown as GameLoop),
          () => {
            setLocalTasksDone(true);
            engineProxy.setPhase('playing');
          },
        );
        return () => {
          engineProxy.stop();
          gameLoopRef.current = null;
          setTouchInput(null);
          if (victoryTimeoutRef.current) {
            clearTimeout(victoryTimeoutRef.current);
            victoryTimeoutRef.current = null;
          }
        };
      } catch (e) {
        console.warn('[sim-worker] proxy construction failed:', e);
        // Critical: if the constructor threw AFTER calling
        // transferControlToOffscreen (e.g. partial transfer, postMessage
        // failure), the canvases are now detached — getContext returns null
        // and any further proxy / GameLoop construction would silently
        // produce a black screen. Detect detachment and short-circuit
        // instead of cascading. User recovers via ?simWorker=off.
        if (canvasesDetached(bgCanvas, fgCanvas, hudCanvas, bgNightCanvas, lightCanvas)) {
          console.error('[sim-worker] canvases detached, cannot fall back; refresh with ?simWorker=off to recover');
          return;
        }
        // Canvases still fresh — fall through to the renderer-only path.
      }
    }

    const useWorker = isWorkerEnabled();
    let workerProxy: RendererProxy | null = null;
    if (useWorker) {
      try {
        workerProxy = new RendererProxy({
          bgCanvas,
          fgCanvas,
          hudCanvas,
          bgNightCanvas,
          fgNightTint,
          lightCanvas,
          theme: getTheme(arena.themeId),
          mirrored: matchSettings.mods.mirrorArena,
          timeLimit: matchSettings.timeLimit,
          renderScale: getRenderScale(),
          language: i18n.language,
          // Enable worker-side perfTrace + section snapshot when ?debug=perf.
          // Same gate as main-thread perfTrace; ships per-second rollups.
          perfEnabled: debugFlags.perfEnabled,
          navDebugEnabled: debugFlags.navDebugEnabled,
          netDebugEnabled: debugFlags.netDebugEnabled,
          fpsEnabled: debugFlags.fpsEnabled,
          onError: (m) => console.error('[render worker]', m),
        });
      } catch (e) {
        console.warn('[worker offload] proxy construction failed:', e);
        workerProxy = null;
        // Same detachment guard — if RendererProxy partially transferred
        // before throwing, GameLoop's `getContext('2d')` would return null
        // and the canvas would silently render nothing.
        if (canvasesDetached(bgCanvas, fgCanvas, hudCanvas, bgNightCanvas, lightCanvas)) {
          console.error('[render worker] canvases detached, cannot fall back; refresh with ?worker=off to recover');
          return;
        }
      }
    }

    const loop = new GameLoop(
      bgCanvas,
      fgCanvas,
      arena,
      matchSettings,
      activePlayers,
      onMatchEnd,
      hudCanvas,
      undefined, // rng
      bgNightCanvas,
      fgNightTint,
      lightCanvas,
      workerProxy ?? undefined,
    );

    gameLoopRef.current = loop;
    loop.setOnPhaseChange((phase: MatchPhase) => {
      setPhaseIsLoading(phase === 'loading');
    });
    loop.start();
    setTouchInput(loop.getTouchInput());

    // Kick off loading — music preload + background render + sprite warmup.
    // `.finally` path also covers timeout (graceful degradation; match
    // starts with whatever assets made it in).
    kickoffLoading(loop, () => gameLoopRef.current === loop, () => {
      setLocalTasksDone(true);
      loop.setPhase('playing');
    });

    return () => {
      loop.stop();
      gameLoopRef.current = null;
      setTouchInput(null);
      if (workerProxy) {
        workerProxy.destroy();
      }
      if (victoryTimeoutRef.current) {
        clearTimeout(victoryTimeoutRef.current);
        victoryTimeoutRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayers, matchSettings, setMatchResult, isOnline]);
}

/** True when any of the supplied canvases has been transferred to a
 *  worker (offscreen). After `transferControlToOffscreen`, `getContext`
 *  returns null on the original element. We use this to detect a
 *  half-transferred state where a proxy threw mid-construction — in that
 *  case the cascading fallback can't safely re-transfer or fall back to
 *  a main-thread Renderer (whose `getContext('2d')` would also be null). */
function canvasesDetached(...canvases: Array<HTMLCanvasElement | undefined>): boolean {
  for (const c of canvases) {
    if (c && c.getContext('2d') === null) return true;
  }
  return false;
}
