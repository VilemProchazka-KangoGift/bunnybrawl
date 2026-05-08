import { useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { GameLoop } from '../engine/gameLoop';
import { NetMatch } from '../engine/net/netMatch';
import { MsgType } from '../engine/net/protocol';
import { getModalTransport, tearDownOnlineSession } from './OnlineModal';
import { listPlayableArenaPacks } from '../engine/arenas';
import { isTouchPrimary } from '../engine/touchDetect';
import { TouchOverlay } from './TouchOverlay';
import type { TouchInputManager } from '../engine/touchInput';
import { useTransientBanner } from '../hooks/useTransientBanner';
import { useWakeLock } from '../hooks/useWakeLock';
import { useLoadingOverlay } from './match/useLoadingOverlay';
import { useLocalMatch, kickoffLoading } from './match/useLocalMatch';
import { useOnlineMatch } from './match/useOnlineMatch';
import { useMatchKeyboard } from './match/useMatchKeyboard';
import { MatchCanvases } from './match/MatchCanvases';
import { MatchOverlays } from './match/MatchOverlays';
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

  // Esc/Enter pause-resume + skip-countdown shortcuts + beforeunload prompt.
  useMatchKeyboard(gameLoopRef, showLevelSelect, setShowLevelSelect, handlePause, handleResume);

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
        <MatchCanvases
          bgRef={bgCanvasRef}
          bgNightRef={bgNightCanvasRef}
          fgRef={fgCanvasRef}
          fgNightTintRef={fgNightTintRef}
          hudRef={hudCanvasRef}
        />
        {touchInput && <TouchOverlay touchInput={touchInput} />}
        {isMobile && !paused && (
          <button className="mobile-overlay-btn mobile-pause-btn" onClick={handlePause} data-testid="mobile-pause-btn">
            &#9646;&#9646;
          </button>
        )}
        <MatchOverlays
          paused={paused}
          showLevelSelect={showLevelSelect}
          currentArenaId={currentArenaId}
          setShowLevelSelect={setShowLevelSelect}
          handleResume={handleResume}
          handleQuit={handleQuit}
          handleChangeArena={handleChangeArena}
          isOnline={online.isOnline}
          isHost={online.isHost}
          showLoadingOverlay={showLoadingOverlay}
          showLoadingCancel={showLoadingCancel}
          phaseIsLoading={phaseIsLoading}
          localTasksDone={localTasksDone}
          unstable={unstable}
          banner={banner}
          isReconnecting={isReconnecting}
          reconnectAttempt={reconnectAttempt}
          reconnectMax={reconnectMax}
          reconnectFailed={reconnectFailed}
        />
      </div>
    </div>
  );
}
