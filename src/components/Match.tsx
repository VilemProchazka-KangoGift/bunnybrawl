import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { GameLoop } from '../engine/gameLoop';
import { NetMatch } from '../engine/net/netMatch';
import { MsgType } from '../engine/net/protocol';
import { getModalTransport } from './MainMenu';
import { getArena, listArenas } from '../engine/arena';
import { listThemes } from '../engine/themes/registry';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { isTouchPrimary } from '../engine/touchDetect';
import { TouchOverlay } from './TouchOverlay';
import type { TouchInputManager } from '../engine/touchInput';
import type { PlayerSlot } from '../engine/types';
import './Match.css';

// Track last resolved arena so random doesn't repeat on rematch
let lastResolvedArenaId: string | null = null;

function resolveArenaId(arenaId: string): string {
  if (arenaId !== 'random') {
    lastResolvedArenaId = arenaId;
    return arenaId;
  }
  const arenas = listArenas();
  const available = arenas.filter(a => a.id !== lastResolvedArenaId);
  const pick = available[Math.floor(Math.random() * available.length)] || arenas[0];
  lastResolvedArenaId = pick.id;
  return pick.id;
}

export function Match() {
  const { t } = useTranslation();
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<GameLoop | null>(null);
  const victoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { activePlayers, matchSettings, setMatchResult, setScreen, setActivePlayers, setMatchSettings, online, resetOnline } = useGameStore();
  const [paused, setPaused] = useState(false);
  const [showLevelSelect, setShowLevelSelect] = useState(false);
  const [connectionUnstable, setConnectionUnstable] = useState(false);
  const netMatchRef = useRef<NetMatch | null>(null);
  const [touchInput, setTouchInput] = useState<TouchInputManager | null>(null);
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
    lastResolvedArenaId = newArenaId;
    setCurrentArenaId(newArenaId);
    setMatchSettings({ arenaId: newArenaId });
    setPaused(false);
    setShowLevelSelect(false);
    // In online mode, notify guest of arena change
    if (online.isOnline && online.isHost) {
      const transport = getModalTransport();
      if (transport) {
        transport.sendReliable({ type: MsgType.SETTINGS_SYNC, arenaId: newArenaId } as import('../engine/net/protocol').ReliableMessage);
      }
    }
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
    if (!bgCanvas || !fgCanvas) return;

    const arena = getArena(currentArenaId);
    const onMatchEnd = (winner: import('../engine/types').PlayerSlot | null, state: import('../engine/types').MatchState) => {
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
      const transport = getModalTransport();
      if (!transport) {
        console.error('No active transport for online match');
        setScreen('menu');
        return;
      }

      const netMatch = new NetMatch({
        bgCanvas,
        fgCanvas,
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
          // Stall lasted too long — end match
          if (gameLoopRef.current) {
            setMatchResult(null, gameLoopRef.current.getState(), true);
          }
        },
        onDisconnect: () => {
          if (gameLoopRef.current) {
            setMatchResult(null, gameLoopRef.current.getState(), true);
          }
        },
        onPlayerDisconnect: (slot) => {
          console.log(`[Match] Player ${slot} disconnected mid-match`);
          // Player is already killed by removePlayer() in NetMatch
        },
        onArenaChange: (arenaId: string) => {
          // Guest: host changed arena — update local state to trigger remount
          lastResolvedArenaId = arenaId;
          setCurrentArenaId(arenaId);
          setMatchSettings({ arenaId });
        },
      });

      netMatchRef.current = netMatch;
      gameLoopRef.current = netMatch.getGameLoop();
      (window as any).__gameLoop = netMatch.getGameLoop();
      netMatch.getGameLoop().setPlayerNames(useGameStore.getState().online.playerNames);
      netMatch.start();
      setTouchInput(netMatch.getGameLoop().getTouchInput());

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

    // Local mode (unchanged)
    const loop = new GameLoop(
      bgCanvas,
      fgCanvas,
      arena,
      matchSettings,
      activePlayers,
      onMatchEnd,
    );

    gameLoopRef.current = loop;
    (window as any).__gameLoop = loop;
    loop.start();
    setTouchInput(loop.getTouchInput());

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
  }, [currentArenaId, activePlayers, matchSettings, setMatchResult, online.isOnline]);

  // Wake lock: prevent screen dimming during match on mobile
  useEffect(() => {
    if (!isMobile || !('wakeLock' in navigator)) return;
    let wakeLock: WakeLockSentinel | null = null;
    (navigator as any).wakeLock.request('screen').then((wl: WakeLockSentinel) => { wakeLock = wl; }).catch(() => {});
    return () => { wakeLock?.release(); };
  }, [isMobile, currentArenaId]);

  const arenas = listArenas();
  const themes = listThemes();

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
        {touchInput && <TouchOverlay touchInput={touchInput} />}
        {isMobile && !paused && (
          <button className="mobile-overlay-btn mobile-pause-btn" onClick={handlePause} data-testid="mobile-pause-btn">
            &#9646;&#9646;
          </button>
        )}
        {paused && (
          <div className="pause-overlay" data-testid="pause-menu">
            <div className="pause-box">
              {showLevelSelect ? (
                <>
                  <h2 className="pause-title">{t('pause_change_level')}</h2>
                  <div className="pause-arena-grid">
                    {arenas.map(a => {
                      const theme = themes.find(th => th.id === a.themeId);
                      return (
                        <button
                          key={a.id}
                          className={`pause-arena-btn ${a.id === currentArenaId ? 'current' : ''}`}
                          onClick={() => handleChangeArena(a.id)}
                        >
                          <div className="pause-arena-preview" style={{ background: theme?.previewGradient || '#333' }}>
                            <span className="pause-arena-icon">{theme?.previewIcon || ''}</span>
                          </div>
                          <span className="pause-arena-name">{t(theme?.nameKey || a.name)}</span>
                        </button>
                      );
                    })}
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
        {connectionUnstable && !paused && online.isOnline && (
          <div className="connection-unstable-indicator" data-testid="connection-unstable">
            {t('connection_unstable', 'Connection Unstable')}
          </div>
        )}
      </div>
    </div>
  );
}
