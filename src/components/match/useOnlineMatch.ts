import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { GameLoop } from '../../engine/gameLoop';
import { NetMatch } from '../../engine/net/netMatch';
import { MsgType } from '../../engine/net/protocol';
import { getModalTransport, getHostReclaimTokens, getGuestOwnReclaimToken } from '../OnlineModal';
import { getArena, getTheme } from '../../engine/arenas';
import { perfTrace } from '../../engine/perfTrace';
import * as fpsCounter from '../../engine/fpsCounter';
import { isWorkerEnabled, RendererProxy } from '../../engine/worker';
import { getRenderScale } from '../../engine/renderScale';
import { debugFlags } from '../../engine/debugFlags';
import i18n from '../../i18n';
import type { TouchInputManager } from '../../engine/touchInput';
import type {
  PlayerSlot, MatchState, MatchSettings, GameScreen,
} from '../../engine/types';
import type { TFunction } from 'i18next';
import { kickoffLoading } from './useLocalMatch';

export interface UseOnlineMatchParams {
  // Canvas refs.
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  bgNightCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  fgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  fgNightTintRef: React.RefObject<HTMLDivElement | null>;
  lightCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  hudCanvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Lifecycle refs.
  gameLoopRef: React.MutableRefObject<GameLoop | null>;
  netMatchRef: React.MutableRefObject<NetMatch | null>;
  victoryTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  disconnectDelayRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  reconnectFailedRef: React.MutableRefObject<boolean>;
  isReconnectingRef: React.MutableRefObject<boolean>;

  // Inputs.
  currentArenaId: string;
  activePlayers: PlayerSlot[];
  matchSettings: MatchSettings;
  isOnline: boolean;
  isHost: boolean;
  localSlot: PlayerSlot | null;

  // Setters.
  setMatchResult: (winner: PlayerSlot | null, state: MatchState, isDisconnect?: boolean) => void;
  setScreen: (screen: GameScreen) => void;
  setMatchSettings: (s: Partial<MatchSettings>) => void;
  setCurrentArenaId: (id: string) => void;
  resetLastResolvedArena: (id: string) => void;
  setTouchInput: (t: TouchInputManager | null) => void;
  setPhaseIsLoading: (b: boolean) => void;
  setLocalTasksDone: (b: boolean) => void;
  setUnstable: React.Dispatch<React.SetStateAction<{ kind: 'mine' } | { kind: 'them'; name: string } | null>>;
  setIsReconnecting: (b: boolean) => void;
  setReconnectFailed: (b: boolean) => void;
  setReconnectAttempt: (n: number) => void;
  setReconnectMax: (n: number) => void;
  flashBanner: (msg: string, ms: number) => void;
  t: TFunction;
}

/**
 * Online-mode lifecycle: constructs a `NetMatch`, wires every transport
 * callback (stall, disconnect, reconnect attempts, peer reconnects, arena
 * change, phase change, loading timeout), kicks off asset preload + LOADED
 * handshake, and tears everything down on unmount.
 *
 * Cleanup order (preserved from the original Match.tsx effect):
 *   1. netMatch.stop()                — RAF cancel + audio teardown
 *   2. netMatchRef.current = null    — drop our reference
 *   3. commonCleanup: gameLoopRef = null, setTouchInput(null), clear victoryTimeoutRef
 *   4. clear disconnectDelayRef       — pending reconnectFailed→victory transition
 *
 * IMPORTANT: this effect early-returns when `isOnline === false` so the
 * companion `useLocalMatch` runs in that branch. Both effects include
 * `isOnline` in their dep array.
 *
 * IMPORTANT: `currentArenaId` is intentionally NOT in the dep array —
 * arena change is in-place via `gameLoop.switchArena()` (host) or via the
 * `onArenaChange` callback (guest). Adding it would trigger a Match
 * remount and drop NetMatch transport wiring.
 *
 * Reconnect-failed flash uses a 1.8s timer before transitioning to the
 * disconnect-victory screen — without the flash the screen cuts to victory
 * too abruptly. Preserved from the original behavior.
 */
export function useOnlineMatch(p: UseOnlineMatchParams): void {
  const {
    bgCanvasRef, bgNightCanvasRef, fgCanvasRef, fgNightTintRef, lightCanvasRef, hudCanvasRef,
    gameLoopRef, netMatchRef, victoryTimeoutRef, disconnectDelayRef,
    reconnectFailedRef, isReconnectingRef,
    currentArenaId, activePlayers, matchSettings, isOnline, isHost, localSlot,
    setMatchResult, setScreen, setMatchSettings, setCurrentArenaId,
    resetLastResolvedArena, setTouchInput,
    setPhaseIsLoading, setLocalTasksDone,
    setUnstable, setIsReconnecting, setReconnectFailed,
    setReconnectAttempt, setReconnectMax, flashBanner, t,
  } = p;

  /** See useLocalMatch.ts for the rationale — deferred teardown survives
   *  React StrictMode's dev double-mount of effects that can't safely
   *  unmount/remount (worker spawn + transferControlToOffscreen). */
  const lifecycleRef = useRef<{
    teardown: (() => void) | null;
    timer: ReturnType<typeof setTimeout> | null;
    deps: { activePlayers: typeof activePlayers; matchSettings: typeof matchSettings } | null;
  }>({ teardown: null, timer: null, deps: null });

  useEffect(() => {
    if (!isOnline) return;

    // StrictMode-safe deferred teardown: cancel pending timer if this is
    // a remount with unchanged deps, reuse the existing NetMatch.
    if (lifecycleRef.current.timer !== null) {
      clearTimeout(lifecycleRef.current.timer);
      lifecycleRef.current.timer = null;
      const prev = lifecycleRef.current.deps;
      const depsUnchanged = prev !== null
        && prev.activePlayers === activePlayers
        && prev.matchSettings === matchSettings;
      if (depsUnchanged) {
        const reusedTeardown = lifecycleRef.current.teardown;
        return () => {
          lifecycleRef.current.timer = setTimeout(() => {
            reusedTeardown?.();
            lifecycleRef.current.teardown = null;
            lifecycleRef.current.deps = null;
            lifecycleRef.current.timer = null;
          }, 0);
        };
      }
      // Real dep change: tear down old NetMatch synchronously. Canvases
      // stay detached — fresh construction below will hit the same wall
      // as the local-mode path. Documented limitation.
      lifecycleRef.current.teardown?.();
      lifecycleRef.current.teardown = null;
      lifecycleRef.current.deps = null;
    }
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    const hudCanvas = hudCanvasRef.current;
    if (!bgCanvas || !fgCanvas || !hudCanvas) return;
    const bgNightCanvas = bgNightCanvasRef.current ?? undefined;
    const fgNightTint = fgNightTintRef.current ?? undefined;
    const lightCanvas = lightCanvasRef.current ?? undefined;

    const clearTimer = (ref: { current: ReturnType<typeof setTimeout> | null }) => {
      if (ref.current) { clearTimeout(ref.current); ref.current = null; }
    };
    const commonCleanup = () => {
      gameLoopRef.current = null;
      setTouchInput(null);
      clearTimer(victoryTimeoutRef);
    };

    const arena = getArena(currentArenaId);
    let matchEnded = false;
    const onMatchEnd = (winner: PlayerSlot | null, state: MatchState) => {
      if (matchEnded) return; // guard against double-fire (GameLoop + MATCH_RESULT)
      matchEnded = true;
      // Suppress stall detection during victory transition
      if (netMatchRef.current) netMatchRef.current.setMatchOver();
      // Host sends match result to guest
      if (isHost) {
        const tr = getModalTransport();
        if (tr) {
          tr.sendReliable({ type: MsgType.MATCH_RESULT, winner } as import('../../engine/net/protocol').ReliableMessage);
        }
      }
      victoryTimeoutRef.current = setTimeout(() => {
        setMatchResult(winner, state);
      }, 1500);
    };

    window.__perfTrace = perfTrace;
    window.__fpsCounter = fpsCounter;

    setPhaseIsLoading(true);
    setLocalTasksDone(false);
    const transport = getModalTransport();
    if (!transport) {
      console.error('No active transport for online match');
      setScreen('menu');
      return;
    }

    // Worker offload: same path as useLocalMatch — when the local-device
    // flag is on, transfer the canvases to a Web Worker that hosts the
    // Renderer. NetMatch's GameLoop adopts the proxy via injectedRenderer.
    // Both host and guest paths use the same flag.
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
          perfEnabled: debugFlags.perfEnabled,
          onError: (m) => console.error('[render worker]', m),
        });
      } catch (e) {
        console.warn('[worker offload] proxy construction failed (online), falling back:', e);
        workerProxy = null;
      }
    }

    const netMatch = new NetMatch({
      injectedRenderer: workerProxy ?? undefined,
      bgCanvas,
      bgNightCanvas,
      fgNightTint,
      lightCanvas,
      fgCanvas,
      hudCanvas,
      arena,
      settings: matchSettings,
      activePlayers,
      onMatchEnd,
      transport,
      localSlot: isHost ? 'P1' : 'P2',
      remoteSlots: activePlayers.filter(s => s !== (isHost ? 'P1' : 'P2') && s.startsWith('P')) as PlayerSlot[],
      // Reclaim tokens issued during the lobby. Host: full Map<slot,token>;
      // guest: own token only. Used to authenticate RECONNECT_REQUEST so a
      // malicious peer in the room can't claim a disconnected stranger's slot.
      reclaimTokens: isHost ? getHostReclaimTokens() : undefined,
      ownReclaimToken: !isHost ? (getGuestOwnReclaimToken() ?? undefined) : undefined,
      onStall: (stalled) => {
        setUnstable(stalled ? { kind: 'mine' } : null);
      },
      onDisconnect: () => {
        // If the match ended naturally and the peer disconnected during the
        // 1.5s pre-victory pause, replace the queued natural-result with a
        // disconnect-win so the victory screen suppresses the now-pointless
        // rematch buttons.
        if (matchEnded) {
          if (victoryTimeoutRef.current) {
            clearTimeout(victoryTimeoutRef.current);
            victoryTimeoutRef.current = null;
          }
          if (gameLoopRef.current) {
            setMatchResult(null, gameLoopRef.current.getState(), true);
          }
          return;
        }
        // Flash "Could not reconnect" for ~1.8s before the victory screen.
        reconnectFailedRef.current = true;
        setReconnectFailed(true);
        if (disconnectDelayRef.current) clearTimeout(disconnectDelayRef.current);
        disconnectDelayRef.current = setTimeout(() => {
          disconnectDelayRef.current = null;
          reconnectFailedRef.current = false;
          setReconnectFailed(false);
          // If the match also ended naturally during the 1.8s flash window,
          // the natural-result victoryTimeoutRef has already fired —
          // skip to avoid clobbering the winner with a null disconnect-win.
          if (matchEnded) return;
          if (gameLoopRef.current) {
            setMatchResult(null, gameLoopRef.current.getState(), true);
          }
        }, 1800);
      },
      onReconnecting: (reconnecting) => {
        const wasReconnecting = isReconnectingRef.current;
        isReconnectingRef.current = reconnecting;
        setIsReconnecting(reconnecting);
        if (!reconnecting) setReconnectAttempt(0);
        if (wasReconnecting && !reconnecting && !reconnectFailedRef.current) {
          flashBanner(t('reconnected', 'Reconnected!'), 2000);
        }
      },
      onReconnectAttempt: (current, max) => {
        setReconnectAttempt(current);
        setReconnectMax(max);
      },
      onPlayerDisconnect: (slot) => {
        const name = useGameStore.getState().online.playerNames[slot] || slot;
        flashBanner(t('player_disconnected_name', '{{name}} left the match', { name }), 4000);
      },
      onGuestReconnected: (slot) => {
        // Guest reclaimed their slot — re-send SETTINGS_SYNC so they see
        // any arena change that happened while they were disconnected.
        if (!isHost) return;
        const ms = useGameStore.getState().matchSettings;
        const tr = getModalTransport();
        if (tr) {
          tr.sendReliableTo(slot, {
            type: MsgType.SETTINGS_SYNC, arenaId: ms.arenaId,
            killLimit: ms.killLimit, timeLimit: ms.timeLimit,
            goreMode: ms.goreMode, mods: ms.mods,
            rngSeed: useGameStore.getState().online.rngSeed,
            botCount: ms.botCount, botDifficulty: ms.botDifficulty,
          } as import('../../engine/net/protocol').ReliableMessage);
        }
        const name = useGameStore.getState().online.playerNames[slot] || slot;
        flashBanner(t('player_reconnected_name', '{{name}} reconnected', { name }), 3000);
      },
      onArenaChange: (arenaId: string) => {
        // Guest: host changed arena — switch in place and rerun loading
        resetLastResolvedArena(arenaId);
        setCurrentArenaId(arenaId);
        setMatchSettings({ arenaId });
        const loop = gameLoopRef.current;
        const nm = netMatchRef.current;
        if (!loop || !nm) return;
        setLocalTasksDone(false);
        loop.switchArena(arenaId);
        kickoffLoading(loop, () => netMatchRef.current === nm, () => {
          setLocalTasksDone(true);
          if (isHost) nm.markHostLoaded();
          else nm.signalGuestLoaded();
        }, nm);
      },
      onPhaseChange: (phase) => {
        setPhaseIsLoading(phase === 'loading');
      },
      onLoadingTimeout: (slots) => {
        if (!slots.length) return;
        const names = slots
          .map(s => useGameStore.getState().online.playerNames[s] || s)
          .join(', ');
        flashBanner(t('loading_starting_without', 'Starting without {{names}}', { names }), 4000);
      },
      onGuestConnectionUnstable: (slot, stalled) => {
        if (!stalled) {
          setUnstable(prev => prev?.kind === 'them' ? null : prev);
          return;
        }
        const name = useGameStore.getState().online.playerNames[slot] || slot;
        setUnstable({ kind: 'them', name });
      },
    });

    netMatchRef.current = netMatch;
    gameLoopRef.current = netMatch.getGameLoop();
    netMatch.getGameLoop().setPlayerNames(useGameStore.getState().online.playerNames);
    netMatch.getGameLoop().setLocalSlot((isHost ? 'P1' : localSlot) as PlayerSlot);
    netMatch.start();
    setTouchInput(netMatch.getGameLoop().getTouchInput());

    // Online loading: both sides preload, then signal readiness. Host flips
    // phase to 'playing' only after all guests report LOADED (or after the
    // 15s hard timeout in NetMatch).
    kickoffLoading(
      netMatch.getGameLoop(),
      () => netMatchRef.current === netMatch,
      () => {
        setLocalTasksDone(true);
        if (isHost) netMatch.markHostLoaded();
        else netMatch.signalGuestLoaded();
      },
      netMatch,
    );

    const teardown = (): void => {
      netMatch.stop();
      netMatchRef.current = null;
      commonCleanup();
      if (workerProxy) workerProxy.destroy();
      clearTimer(disconnectDelayRef);
    };
    lifecycleRef.current.teardown = teardown;
    lifecycleRef.current.deps = { activePlayers, matchSettings };
    return () => {
      // Defer for StrictMode safety. The remount will cancel this timer
      // before it fires; real unmount lets it fire.
      lifecycleRef.current.timer = setTimeout(() => {
        teardown();
        lifecycleRef.current.teardown = null;
        lifecycleRef.current.deps = null;
        lifecycleRef.current.timer = null;
      }, 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayers, matchSettings, setMatchResult, isOnline]);
}
