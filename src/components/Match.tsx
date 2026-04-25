import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { GameLoop } from '../engine/gameLoop';
import { NetMatch } from '../engine/net/netMatch';
import { MsgType } from '../engine/net/protocol';
import { getModalTransport, tearDownOnlineSession, getHostReclaimTokens, getGuestOwnReclaimToken } from './OnlineModal';
import { getArena, listArenaPacks } from '../engine/arenas';
import { ArenaGrid } from './ArenaGrid';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { isTouchPrimary } from '../engine/touchDetect';
import { TouchOverlay } from './TouchOverlay';
import type { TouchInputManager } from '../engine/touchInput';
import type { PlayerSlot, MatchPhase } from '../engine/types';
import { runLoadingTasks } from '../engine/matchLoading';
import { useTransientBanner } from '../hooks/useTransientBanner';
import { useDelayedFlag } from '../hooks/useDelayedFlag';
import { useWakeLock } from '../hooks/useWakeLock';
import './Match.css';

// Track last resolved arena so random doesn't repeat on rematch. Intentionally
// module-scope so it survives Match unmounts during a single session.
// Cleared on handleQuit (return to menu) so a new session draws freely.
let lastResolvedArenaId: string | null = null;

function resolveArenaId(arenaId: string): string {
  if (arenaId !== 'random') {
    lastResolvedArenaId = arenaId;
    return arenaId;
  }
  const allArenas = listArenaPacks();
  const available = allArenas.filter(a => a.id !== lastResolvedArenaId);
  const pick = available[Math.floor(Math.random() * available.length)] || allArenas[0];
  lastResolvedArenaId = pick.id;
  return pick.id;
}

/** Run loading tasks for a GameLoop, applying a stale-promise guard so a
 *  rapid arena swap can't mis-signal readiness for an outdated arena.
 *  `onReady` fires only when both:
 *    - the GameLoop is still the current one (`isCurrent()`)
 *    - no switchArena has bumped the loading generation since we started
 *  Catch-branch fires too on timeout (graceful degradation — match starts
 *  anyway with whatever assets made it in). */
function kickoffLoading(
  loop: GameLoop,
  isCurrent: () => boolean,
  onReady: () => void,
): void {
  const startGen = loop.getLoadingGeneration();
  runLoadingTasks({
    arenaId: loop.getArena().themeId,
    characterNames: loop.getActiveCharacterNames(),
    renderer: loop.getRenderer(),
    arena: loop.getArena(),
    originalArena: loop.getOriginalArena(),
  }).finally(() => {
    if (!isCurrent()) return;
    if (loop.getLoadingGeneration() !== startGen) return;
    onReady();
  });
}

export function Match() {
  const { t } = useTranslation();
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<GameLoop | null>(null);
  const victoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { activePlayers, matchSettings, setMatchResult, setScreen, setActivePlayers, setMatchSettings, online, resetOnline, clearMatchResult } = useGameStore();
  const [paused, setPaused] = useState(false);
  const [showLevelSelect, setShowLevelSelect] = useState(false);
  // Mutually exclusive: local stall (my snapshot stream lagged) vs peer stall
  // (a remote told us they lagged). JSX renders whichever is non-null.
  const [unstable, setUnstable] = useState<{ kind: 'mine' } | { kind: 'them'; name: string } | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);
  // Refs shadow state so callbacks read the current value, not a stale
  // mount-time closure.
  const reconnectFailedRef = useRef(false);
  const isReconnectingRef = useRef(false);
  const disconnectDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const netMatchRef = useRef<NetMatch | null>(null);
  const [touchInput, setTouchInput] = useState<TouchInputManager | null>(null);
  // Two sources drive the loading overlay:
  //   - `phaseIsLoading`: the authoritative gameplay phase (from setPhase on
  //     host OR from snapshot on guest). False once the match can be played.
  //   - `localTasksDone`: THIS client has finished its runLoadingTasks
  //     (music buffered, background painted, sprites warmed).
  // Overlay shows while either is still "not ready" — prevents the guest
  // from hiding the overlay the moment host flips phase if the guest's own
  // asset preload hasn't finished yet.
  const [phaseIsLoading, setPhaseIsLoading] = useState(true);
  const [localTasksDone, setLocalTasksDone] = useState(false);
  const showLoadingOverlay = phaseIsLoading || !localTasksDone;
  // Cancel button only appears after a delay so brief loads don't flicker it.
  const showLoadingCancel = useDelayedFlag(showLoadingOverlay, 3000);
  // Reconnect progress for the overlay. `attempt` goes 0..max as retries fire.
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectMax, setReconnectMax] = useState(12);
  // One shared banner slot used for player-left / player-reconnected /
  // "starting without X" / "Reconnected!" — all short, mutually overriding.
  const [banner, flashBanner] = useTransientBanner<string>();
  const isMobile = useMemo(() => isTouchPrimary(), []);

  // Resolve 'random' to a concrete arena; re-resolves each time Match mounts (rematch)
  const [currentArenaId, setCurrentArenaId] = useState(() =>
    resolveArenaId(matchSettings.arenaId)
  );

  const handleResume = useCallback(() => {
    if (netMatchRef.current) {
      netMatchRef.current.resume();
    } else {
      gameLoopRef.current?.resume();
    }
    setPaused(false);
    setShowLevelSelect(false);
  }, []);

  const handlePause = useCallback(() => {
    const loop = gameLoopRef.current;
    if (!loop || loop.isPaused()) return;
    if (netMatchRef.current) {
      netMatchRef.current.pause();
    } else {
      loop.pause();
    }
    setPaused(true);
  }, []);

  const handleQuit = useCallback(() => {
    // Pending timers would fire after navigation and re-enter victory state.
    if (victoryTimeoutRef.current) { clearTimeout(victoryTimeoutRef.current); victoryTimeoutRef.current = null; }
    if (disconnectDelayRef.current) { clearTimeout(disconnectDelayRef.current); disconnectDelayRef.current = null; }
    if (netMatchRef.current) {
      netMatchRef.current.stop();
      netMatchRef.current = null;
    }
    gameLoopRef.current?.stop();
    gameLoopRef.current = null;
    // Teardown destroys the transport, clears the module-scope transport ref,
    // and drops lobby-issued reclaim tokens — without the token clear, the
    // next online session would inherit stale tokens that no longer match
    // the new host's HostAuthority and reconnect attempts would fail auth.
    tearDownOnlineSession();
    // Drop random-arena memory so a fresh play picks freely; without this,
    // the prior match's arena remains excluded from the next 'random' draw
    // even though resetOnline / setActivePlayers fired.
    lastResolvedArenaId = null;
    // setScreen first, then clear store fields. Match.tsx's effect dep array
    // reacts to online.isOnline; flipping it before screen='menu' would
    // briefly render the match branch with online cleared.
    setScreen('menu');
    setActivePlayers([]);
    resetOnline();
    // Drop ghost match data — without this, a future VictoryScreen mount
    // (or a delayed setMatchResult that slipped past clearTimeout) would
    // surface stale winner/lastMatchState from this match.
    clearMatchResult();
  }, [setActivePlayers, setScreen, resetOnline, clearMatchResult]);

  const handleChangeArena = useCallback((newArenaId: string) => {
    const loop = gameLoopRef.current;
    lastResolvedArenaId = newArenaId;
    setCurrentArenaId(newArenaId);
    setMatchSettings({ arenaId: newArenaId });
    setPaused(false);
    setShowLevelSelect(false);
    // Online: notify guest of arena change (the guest's SETTINGS_SYNC handler
    // drives its own switchArena + runLoadingTasks).
    if (online.isOnline && online.isHost) {
      const transport = getModalTransport();
      if (transport) {
        transport.sendReliable({ type: MsgType.SETTINGS_SYNC, arenaId: newArenaId } as import('../engine/net/protocol').ReliableMessage);
      }
    }
    if (!loop) return;
    // In-place arena swap — no remount, no transport wiring loss. Scores reset.
    setLocalTasksDone(false);
    loop.switchArena(newArenaId);
    // In online mode, host must re-run the LOADED handshake so guests can't
    // be treated as pre-loaded based on the PREVIOUS arena's signals.
    const nm = netMatchRef.current;
    if (nm && online.isOnline && online.isHost) {
      nm.resetLoadingHandshake();
    }
    kickoffLoading(loop, () => gameLoopRef.current === loop, () => {
      setLocalTasksDone(true);
      if (online.isOnline && nm) {
        if (online.isHost) nm.markHostLoaded();
        else nm.signalGuestLoaded();
      } else {
        loop.setPhase('playing');
      }
    });
  }, [setMatchSettings, online.isOnline, online.isHost]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showLevelSelect) {
          setShowLevelSelect(false);
          return;
        }
        const loop = gameLoopRef.current;
        if (!loop) return;

        if (loop.isPaused()) {
          handleResume();
        } else {
          handlePause();
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const loop = gameLoopRef.current;
        if (!loop) return;
        if (loop.isPaused() && !showLevelSelect) {
          handleResume();
        } else {
          loop.skipCountdown();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleResume, handlePause, showLevelSelect]);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    const hudCanvas = hudCanvasRef.current;
    if (!bgCanvas || !fgCanvas || !hudCanvas) return;

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
    const onMatchEnd = (winner: import('../engine/types').PlayerSlot | null, state: import('../engine/types').MatchState) => {
      if (matchEnded) return; // guard against double-fire (GameLoop + MATCH_RESULT)
      matchEnded = true;
      // Suppress stall detection during victory transition
      if (netMatchRef.current) netMatchRef.current.setMatchOver();
      // In online mode, host sends match result to guest
      if (online.isOnline && online.isHost) {
        const transport = getModalTransport();
        if (transport) {
          transport.sendReliable({ type: MsgType.MATCH_RESULT, winner } as import('../engine/net/protocol').ReliableMessage);
        }
      }
      victoryTimeoutRef.current = setTimeout(() => {
        setMatchResult(winner, state);
      }, 1500);
    };

    if (online.isOnline) {
      // Network mode
      setPhaseIsLoading(true);
      setLocalTasksDone(false);
      const transport = getModalTransport();
      if (!transport) {
        console.error('No active transport for online match');
        setScreen('menu');
        return;
      }

      const netMatch = new NetMatch({
        bgCanvas,
        fgCanvas,
        hudCanvas,
        arena,
        settings: matchSettings,
        activePlayers,
        onMatchEnd,
        transport,
        localSlot: online.isHost ? 'P1' : 'P2',
        remoteSlots: activePlayers.filter(s => s !== (online.isHost ? 'P1' : 'P2') && s.startsWith('P')) as PlayerSlot[],
        // Reclaim tokens issued during the lobby. Host: full Map<slot,token>;
        // guest: own token only. Used to authenticate RECONNECT_REQUEST so a
        // malicious peer in the room can't claim a disconnected stranger's slot.
        reclaimTokens: online.isHost ? getHostReclaimTokens() : undefined,
        ownReclaimToken: !online.isHost ? (getGuestOwnReclaimToken() ?? undefined) : undefined,
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
          if (!online.isHost) return;
          const ms = useGameStore.getState().matchSettings;
          const transport = getModalTransport();
          if (transport) {
            transport.sendReliableTo(slot, {
              type: MsgType.SETTINGS_SYNC, arenaId: ms.arenaId,
              killLimit: ms.killLimit, timeLimit: ms.timeLimit,
              goreMode: ms.goreMode, mods: ms.mods,
              rngSeed: useGameStore.getState().online.rngSeed,
              botCount: ms.botCount, botDifficulty: ms.botDifficulty,
            } as import('../engine/net/protocol').ReliableMessage);
          }
          const name = useGameStore.getState().online.playerNames[slot] || slot;
          flashBanner(t('player_reconnected_name', '{{name}} reconnected', { name }), 3000);
        },
        onArenaChange: (arenaId: string) => {
          // Guest: host changed arena — switch in place and rerun loading
          lastResolvedArenaId = arenaId;
          setCurrentArenaId(arenaId);
          setMatchSettings({ arenaId });
          const loop = gameLoopRef.current;
          const nm = netMatchRef.current;
          if (!loop || !nm) return;
          setLocalTasksDone(false);
          loop.switchArena(arenaId);
          kickoffLoading(loop, () => netMatchRef.current === nm, () => {
            setLocalTasksDone(true);
            if (online.isHost) nm.markHostLoaded();
            else nm.signalGuestLoaded();
          });
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
      window.__gameLoop = netMatch.getGameLoop();
      (window as any).__netMatch = netMatch;
      netMatch.getGameLoop().setPlayerNames(useGameStore.getState().online.playerNames);
      netMatch.getGameLoop().setLocalSlot((online.isHost ? 'P1' : online.localSlot) as PlayerSlot);
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
          if (online.isHost) netMatch.markHostLoaded();
          else netMatch.signalGuestLoaded();
        },
      );

      return () => {
        netMatch.stop();
        netMatchRef.current = null;
        commonCleanup();
        clearTimer(disconnectDelayRef);
      };
    }

    // Local mode
    setPhaseIsLoading(true);
    setLocalTasksDone(false);
    const loop = new GameLoop(
      bgCanvas,
      fgCanvas,
      arena,
      matchSettings,
      activePlayers,
      onMatchEnd,
      hudCanvas,
    );

    gameLoopRef.current = loop;
    window.__gameLoop = loop;
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
      commonCleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayers, matchSettings, setMatchResult, online.isOnline]);

  // Wake lock: prevent screen dimming during match on mobile
  useWakeLock(isMobile);

  return (
    <div className="match-container" data-testid="match-screen">
      <div className="canvas-container">
        <canvas
          ref={bgCanvasRef}
          className="game-canvas bg-canvas"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        />
        <canvas
          ref={fgCanvasRef}
          className="game-canvas fg-canvas"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          data-testid="game-canvas"
        />
        <canvas
          ref={hudCanvasRef}
          className="game-canvas hud-canvas"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        />
        {touchInput && <TouchOverlay touchInput={touchInput} />}
        {isMobile && !paused && (
          <button className="mobile-overlay-btn mobile-pause-btn" onClick={handlePause} data-testid="mobile-pause-btn">
            &#9646;&#9646;
          </button>
        )}
        {showLoadingOverlay && (
          <div
            className="match-loading-overlay"
            data-testid="match-loading-overlay"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="match-loading-spinner" />
            <div className="match-loading-text">{t('loading', 'Loading...')}</div>
            <div className="match-loading-sub" data-testid="match-loading-sub">
              {online.isOnline && localTasksDone && phaseIsLoading
                ? t('loading_waiting_others', 'Waiting for other players...')
                : t('loading_arena', 'Loading arena...')}
            </div>
            {showLoadingCancel && (
              <button
                className="btn-base pause-btn quit-btn match-loading-cancel"
                onClick={handleQuit}
                data-testid="match-loading-cancel"
              >
                {t('loading_cancel', 'Cancel')}
              </button>
            )}
          </div>
        )}
        {paused && (
          <div className="pause-overlay" data-testid="pause-menu">
            <div className="pause-box">
              {showLevelSelect ? (
                <>
                  <h2 className="pause-title">{t('pause_change_level')}</h2>
                  <div className="pause-arena-grid">
                    <ArenaGrid
                      classPrefix="pause-arena"
                      currentId={currentArenaId}
                      selectedClass="current"
                      onSelect={handleChangeArena}
                    />
                  </div>
                  <button className="btn-base pause-btn quit-btn" onClick={() => setShowLevelSelect(false)}>
                    {t('pause_back')}
                  </button>
                </>
              ) : online.isOnline ? (
                /* Online pause menu */
                <>
                  <h2 className="pause-title">{t('pause_title')}</h2>
                  <button className="btn-base pause-btn resume-btn" onClick={handleResume} data-testid="resume-button">
                    {t('pause_resume')}
                  </button>
                  {online.isHost && (
                    <button className="btn-base pause-btn level-btn" onClick={() => setShowLevelSelect(true)}>
                      {t('pause_change_level')}
                    </button>
                  )}
                  {online.isHost ? (
                    <button className="btn-base pause-btn quit-btn" onClick={handleQuit} data-testid="quit-button">
                      {t('cancel_game', 'Cancel Game')}
                    </button>
                  ) : (
                    <button className="btn-base pause-btn quit-btn" onClick={handleQuit} data-testid="quit-button">
                      {t('leave_game', 'Leave Game')}
                    </button>
                  )}
                </>
              ) : (
                /* Local pause menu */
                <>
                  <h2 className="pause-title">{t('pause_title')}</h2>
                  <button className="btn-base pause-btn resume-btn" onClick={handleResume} data-testid="resume-button">
                    {t('pause_resume')}
                  </button>
                  <button className="btn-base pause-btn level-btn" onClick={() => setShowLevelSelect(true)}>
                    {t('pause_change_level')}
                  </button>
                  <button className="btn-base pause-btn quit-btn" onClick={handleQuit} data-testid="quit-button">
                    {t('pause_quit')}
                  </button>
                  <p className="pause-hint">{t('pause_hint')}</p>
                </>
              )}
            </div>
          </div>
        )}
        {!paused && online.isOnline && (() => {
          // Unstable-indicator slot: unstable takes priority over the transient
          // banner when both would show simultaneously.
          if (unstable && !isReconnecting) return (
            <div
              className="connection-unstable-indicator"
              data-testid={unstable.kind === 'mine' ? 'connection-unstable' : 'connection-unstable-them'}
              role="status"
              aria-live="polite"
            >
              {unstable.kind === 'mine'
                ? t('connection_unstable_mine', 'Your connection is unstable')
                : t('connection_unstable_them', '{{name}} has a slow connection', { name: unstable.name })}
            </div>
          );
          if (banner) return (
            <div className="connection-unstable-indicator" data-testid="disconnect-banner" role="status" aria-live="polite">
              {banner}
            </div>
          );
          return null;
        })()}
        {isReconnecting && online.isOnline && (
          <div className="reconnecting-overlay" role="status" aria-live="polite">
            <div className="reconnecting-box">
              <div className="reconnecting-spinner" />
              <div className="reconnecting-text">
                {t('reconnecting', 'Reconnecting...')}
              </div>
              {reconnectAttempt > 0 && (
                <div className="reconnecting-sub">
                  {t('reconnecting_attempt', 'Attempt {{n}}/{{max}}', { n: reconnectAttempt, max: reconnectMax })}
                </div>
              )}
              <button className="btn-base pause-btn quit-btn" onClick={handleQuit} data-testid="reconnect-give-up">
                {t('give_up', 'Give Up')}
              </button>
            </div>
          </div>
        )}
        {reconnectFailed && online.isOnline && (
          <div className="reconnecting-overlay" data-testid="reconnect-failed" role="alert" aria-live="assertive">
            <div className="reconnecting-box">
              <div className="reconnecting-text">
                {t('reconnect_failed', 'Could not reconnect.')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
