import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { GameLoop } from '../engine/gameLoop';
import { NetMatch } from '../engine/net/netMatch';
import { MsgType } from '../engine/net/protocol';
import { getModalTransport } from './OnlineModal';
import { getArena, listArenaPacks } from '../engine/arenas';
import { ArenaGrid } from './ArenaGrid';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { isTouchPrimary } from '../engine/touchDetect';
import { TouchOverlay } from './TouchOverlay';
import type { TouchInputManager } from '../engine/touchInput';
import type { PlayerSlot, MatchPhase } from '../engine/types';
import { runLoadingTasks } from '../engine/matchLoading';
import './Match.css';

// Track last resolved arena so random doesn't repeat on rematch
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

export function Match() {
  const { t } = useTranslation();
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<GameLoop | null>(null);
  const victoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { activePlayers, matchSettings, setMatchResult, setScreen, setActivePlayers, setMatchSettings, online, resetOnline } = useGameStore();
  const [paused, setPaused] = useState(false);
  const [showLevelSelect, setShowLevelSelect] = useState(false);
  const [connectionUnstable, setConnectionUnstable] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
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
    if (netMatchRef.current) {
      netMatchRef.current.stop();
      netMatchRef.current = null;
    }
    gameLoopRef.current?.stop();
    gameLoopRef.current = null;
    const transport = getModalTransport();
    if (transport) transport.destroy();
    resetOnline();
    setActivePlayers([]);
    setScreen('menu');
  }, [setActivePlayers, setScreen, resetOnline]);

  const handleChangeArena = useCallback((newArenaId: string) => {
    const loop = gameLoopRef.current;
    lastResolvedArenaId = newArenaId;
    setCurrentArenaId(newArenaId);
    setMatchSettings({ arenaId: newArenaId });
    setPaused(false);
    setShowLevelSelect(false);
    // In online mode, notify guest of arena change (sent regardless — guest's
    // own switchArena will be driven by SETTINGS_SYNC handler in Task 10)
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
    const startGen = loop.getLoadingGeneration();
    // Run loading tasks for the new arena (music preload, background, sprite warm)
    runLoadingTasks({
      arenaId: newArenaId,
      characterNames: loop.getActiveCharacterNames(),
      renderer: loop.getRenderer(),
      arena: loop.getArena(),
      originalArena: loop.getOriginalArena(),
    }).finally(() => {
      if (gameLoopRef.current !== loop) return;
      // Stale-promise guard: if the user rapid-fired arena changes, only the
      // most recent one flips phase back to playing.
      if (loop.getLoadingGeneration() !== startGen) return;
      setLocalTasksDone(true);
      loop.setPhase('playing');
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
        rngSeed: online.rngSeed,
        onDesync: () => {
          console.warn('Desync detected!');
        },
        onStall: (stalled) => {
          setConnectionUnstable(stalled);
        },
        onStallTimeout: () => {
          if (matchEnded) return; // don't override normal victory with disconnect
          if (gameLoopRef.current) {
            setMatchResult(null, gameLoopRef.current.getState(), true);
          }
        },
        onDisconnect: () => {
          if (matchEnded) return; // don't override normal victory with disconnect
          if (gameLoopRef.current) {
            setMatchResult(null, gameLoopRef.current.getState(), true);
          }
        },
        onReconnecting: (reconnecting) => {
          setIsReconnecting(reconnecting);
        },
        onPlayerDisconnect: (slot) => {
          console.log(`[Match] Player ${slot} disconnected mid-match`);
          // Player is already killed by removePlayer() in NetMatch
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
          const startGen = loop.getLoadingGeneration();
          runLoadingTasks({
            arenaId,
            characterNames: loop.getActiveCharacterNames(),
            renderer: loop.getRenderer(),
            arena: loop.getArena(),
            originalArena: loop.getOriginalArena(),
          }).finally(() => {
            if (netMatchRef.current !== nm) return;
            if (loop.getLoadingGeneration() !== startGen) return;
            setLocalTasksDone(true);
            if (online.isHost) {
              nm.markHostLoaded();
            } else {
              transport.sendReliable({
                type: MsgType.LOADED,
                slot: online.localSlot || 'P2',
              } as import('../engine/net/protocol').ReliableMessage);
            }
          });
        },
        onPhaseChange: (phase) => {
          setPhaseIsLoading(phase === 'loading');
        },
        onGuestConnectionUnstable: (_slot, stalled) => {
          // Host-side banner: reuse the same "Connection Unstable" indicator
          // that guests show for their own snapshot stalls. Gives the host a
          // clue that a guest is laggy without waiting for the pong timeout.
          setConnectionUnstable(stalled);
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
      {
        const loop = netMatch.getGameLoop();
        const startGen = loop.getLoadingGeneration();
        runLoadingTasks({
          arenaId: arena.themeId,
          characterNames: loop.getActiveCharacterNames(),
          renderer: loop.getRenderer(),
          arena: loop.getArena(),
          originalArena: loop.getOriginalArena(),
        }).finally(() => {
          if (netMatchRef.current !== netMatch) return;
          // Stale-promise guard — if switchArena happened while we were
          // loading, don't signal readiness for the OLD arena's assets.
          if (loop.getLoadingGeneration() !== startGen) return;
          setLocalTasksDone(true);
          if (online.isHost) {
            netMatch.markHostLoaded();
          } else {
            transport.sendReliable({
              type: MsgType.LOADED,
              slot: (online.localSlot || 'P2') as PlayerSlot,
            } as import('../engine/net/protocol').ReliableMessage);
          }
        });
      }

      return () => {
        netMatch.stop();
        netMatchRef.current = null;
        gameLoopRef.current = null;
        setTouchInput(null);
        if (victoryTimeoutRef.current) {
          clearTimeout(victoryTimeoutRef.current);
          victoryTimeoutRef.current = null;
        }
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

    // Kick off loading — music preload + background render + sprite warmup
    const localStartGen = loop.getLoadingGeneration();
    runLoadingTasks({
      arenaId: arena.themeId,
      characterNames: loop.getActiveCharacterNames(),
      renderer: loop.getRenderer(),
      arena: loop.getArena(),
      originalArena: loop.getOriginalArena(),
    }).then(() => {
      if (gameLoopRef.current === loop && loop.getLoadingGeneration() === localStartGen) {
        setLocalTasksDone(true);
        loop.setPhase('playing');
      }
    }).catch(() => {
      // Loading timeout — proceed anyway (graceful degradation; first frames
      // may hitch while assets lazy-load)
      if (gameLoopRef.current === loop && loop.getLoadingGeneration() === localStartGen) {
        setLocalTasksDone(true);
        loop.setPhase('playing');
      }
    });

    return () => {
      loop.stop();
      gameLoopRef.current = null;
      setTouchInput(null);
      if (victoryTimeoutRef.current) {
        clearTimeout(victoryTimeoutRef.current);
        victoryTimeoutRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayers, matchSettings, setMatchResult, online.isOnline]);

  // Wake lock: prevent screen dimming during match on mobile
  useEffect(() => {
    if (!isMobile || !('wakeLock' in navigator)) return;
    let wakeLock: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then((wl) => { wakeLock = wl; }).catch(() => {});
    return () => { wakeLock?.release(); };
  }, [isMobile, currentArenaId]);

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
          <div className="match-loading-overlay" data-testid="match-loading-overlay">
            <div className="match-loading-spinner" />
            <div className="match-loading-text">{t('loading', 'Loading...')}</div>
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
        {connectionUnstable && !paused && !isReconnecting && online.isOnline && (
          <div className="connection-unstable-indicator" data-testid="connection-unstable">
            {t('connection_unstable', 'Connection Unstable')}
          </div>
        )}
        {isReconnecting && online.isOnline && (
          <div className="reconnecting-overlay">
            <div className="reconnecting-box">
              <div className="reconnecting-spinner" />
              <div className="reconnecting-text">
                {t('reconnecting', 'Reconnecting...')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
