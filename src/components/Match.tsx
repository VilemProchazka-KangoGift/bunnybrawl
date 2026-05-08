import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { GameLoop } from '../engine/gameLoop';
import { NetMatch } from '../engine/net/netMatch';
import { MsgType } from '../engine/net/protocol';
import { getModalTransport, tearDownOnlineSession } from './OnlineModal';
import { listPlayableArenaPacks } from '../engine/arenas';
import { ArenaGrid } from './ArenaGrid';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { isTouchPrimary } from '../engine/touchDetect';
import { TouchOverlay } from './TouchOverlay';
import type { TouchInputManager } from '../engine/touchInput';
import { useTransientBanner } from '../hooks/useTransientBanner';
import { useWakeLock } from '../hooks/useWakeLock';
import { useLoadingOverlay, loadingSubKey } from './match/useLoadingOverlay';
import { useLocalMatch, kickoffLoading } from './match/useLocalMatch';
import { useOnlineMatch } from './match/useOnlineMatch';
import logoImg from '/logo.png?url';
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
  const allArenas = listPlayableArenaPacks();
  const available = allArenas.filter(a => a.id !== lastResolvedArenaId);
  const pick = available[Math.floor(Math.random() * available.length)] || allArenas[0];
  lastResolvedArenaId = pick.id;
  return pick.id;
}

export function Match() {
  const { t } = useTranslation();
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgNightCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgNightTintRef = useRef<HTMLDivElement>(null);
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
  // Loading overlay state machine. Two signals must clear before the overlay
  // hides: `phaseIsLoading` (gameplay phase from setPhase on host or
  // NetMatch.onPhaseChange on guest) and `localTasksDone` (this client's
  // runLoadingTasks finished). Cancel button auto-appears after 3s.
  const {
    phaseIsLoading, localTasksDone,
    showLoadingOverlay, showLoadingCancel,
    setPhaseIsLoading, setLocalTasksDone,
  } = useLoadingOverlay();
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
    }, nm);
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
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Local-mode lifecycle (extracted hook). Early-returns when isOnline.
  useLocalMatch({
    bgCanvasRef, bgNightCanvasRef, fgCanvasRef, fgNightTintRef, hudCanvasRef,
    gameLoopRef, victoryTimeoutRef,
    currentArenaId, activePlayers, matchSettings,
    setMatchResult, setTouchInput,
    setPhaseIsLoading, setLocalTasksDone,
    isOnline: online.isOnline,
  });

  // Online-mode lifecycle (extracted hook). Early-returns when !isOnline.
  useOnlineMatch({
    bgCanvasRef, bgNightCanvasRef, fgCanvasRef, fgNightTintRef, hudCanvasRef,
    gameLoopRef, netMatchRef, victoryTimeoutRef, disconnectDelayRef,
    reconnectFailedRef, isReconnectingRef,
    currentArenaId, activePlayers, matchSettings,
    isOnline: online.isOnline, isHost: online.isHost, localSlot: online.localSlot,
    setMatchResult, setScreen, setMatchSettings, setCurrentArenaId,
    resetLastResolvedArena: (id: string) => { lastResolvedArenaId = id; },
    setTouchInput,
    setPhaseIsLoading, setLocalTasksDone,
    setUnstable, setIsReconnecting, setReconnectFailed,
    setReconnectAttempt, setReconnectMax, flashBanner, t,
  });

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
          ref={bgNightCanvasRef}
          className="game-canvas bg-night-canvas"
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
        <div
          ref={fgNightTintRef}
          className="fg-night-tint"
          aria-hidden="true"
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
            <img src={logoImg} alt="Carrot Royale" className="match-loading-logo" />
            <div className="match-loading-spinner" />
            <div className="match-loading-text">{t('loading', 'Loading...')}</div>
            <div className="match-loading-sub" data-testid="match-loading-sub">
              {loadingSubKey(online.isOnline, localTasksDone, phaseIsLoading) === 'loading_waiting_others'
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
