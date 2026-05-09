import { useEffect } from 'react';
import { GameLoop } from '../../engine/gameLoop';
import { NetMatch } from '../../engine/net/netMatch';
import { getArena, getTheme } from '../../engine/arenas';
import { perfTrace } from '../../engine/perfTrace';
import * as fpsCounter from '../../engine/fpsCounter';
import { runLoadingTasks } from '../../engine/matchLoading';
import { isWorkerEnabled, RendererProxy } from '../../engine/worker';
import { getRenderScale } from '../../engine/renderScale';
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

    // Worker offload: when the local-device flag is on, transfer the
    // canvases' drawing surfaces to a Web Worker that hosts the Renderer.
    // GameLoop adopts the proxy (an IRenderer) and pushes per-frame state
    // across postMessage. Online play stays on the main-thread Renderer
    // (NetMatch is too tightly wound around the renderer for this pass).
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
          onError: (m) => console.error('[render worker]', m),
        });
      } catch (e) {
        // Browser without OffscreenCanvas / Worker module support — fall
        // back to main-thread Renderer.
        console.warn('[worker offload] proxy construction failed, falling back:', e);
        workerProxy = null;
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
