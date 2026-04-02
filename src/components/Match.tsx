import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { GameLoop } from '../engine/gameLoop';
import { getArena, listArenas } from '../engine/arena';
import { listThemes } from '../engine/themes/registry';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
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
  const { activePlayers, matchSettings, setMatchResult, setScreen, setActivePlayers } = useGameStore();
  const [paused, setPaused] = useState(false);
  const [showLevelSelect, setShowLevelSelect] = useState(false);

  // Resolve 'random' to a concrete arena; re-resolves each time Match mounts (rematch)
  const [currentArenaId, setCurrentArenaId] = useState(() =>
    resolveArenaId(matchSettings.arenaId)
  );

  const handleResume = useCallback(() => {
    gameLoopRef.current?.resume();
    setPaused(false);
    setShowLevelSelect(false);
  }, []);

  const handleQuit = useCallback(() => {
    gameLoopRef.current?.stop();
    gameLoopRef.current = null;
    setActivePlayers([]);
    setScreen('menu');
  }, [setActivePlayers, setScreen]);

  const handleChangeArena = useCallback((newArenaId: string) => {
    lastResolvedArenaId = newArenaId;
    setCurrentArenaId(newArenaId);
    setPaused(false);
    setShowLevelSelect(false);
  }, []);

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
          loop.pause();
          setPaused(true);
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
  }, [handleResume, showLevelSelect]);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!bgCanvas || !fgCanvas) return;

    const arena = getArena(currentArenaId);
    const loop = new GameLoop(
      bgCanvas,
      fgCanvas,
      arena,
      matchSettings,
      activePlayers,
      (winner, state) => {
        victoryTimeoutRef.current = setTimeout(() => {
          setMatchResult(winner, state);
        }, 1500);
      },
    );

    gameLoopRef.current = loop;
    // Expose game state for E2E testing
    (window as any).__gameLoop = loop;
    loop.start();

    return () => {
      loop.stop();
      gameLoopRef.current = null;
      if (victoryTimeoutRef.current) {
        clearTimeout(victoryTimeoutRef.current);
        victoryTimeoutRef.current = null;
      }
    };
  }, [currentArenaId, activePlayers, matchSettings, setMatchResult]);

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
              ) : (
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
      </div>
    </div>
  );
}
