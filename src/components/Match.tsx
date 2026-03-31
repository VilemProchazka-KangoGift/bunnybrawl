import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { GameLoop } from '../engine/gameLoop';
import { getArena } from '../engine/arena';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import './Match.css';

export function Match() {
  const { t } = useTranslation();
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<GameLoop | null>(null);
  const { activePlayers, matchSettings, setMatchResult, setScreen, setActivePlayers } = useGameStore();
  const [paused, setPaused] = useState(false);

  const handleResume = useCallback(() => {
    gameLoopRef.current?.resume();
    setPaused(false);
  }, []);

  const handleQuit = useCallback(() => {
    gameLoopRef.current?.stop();
    gameLoopRef.current = null;
    setActivePlayers([]);
    setScreen('menu');
  }, [setActivePlayers, setScreen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        const loop = gameLoopRef.current;
        if (!loop) return;

        if (loop.isPaused()) {
          handleResume();
        } else {
          loop.pause();
          setPaused(true);
        }
      }
      if (e.key === 'Enter' && gameLoopRef.current?.isPaused()) {
        e.preventDefault();
        handleResume();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleResume]);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!bgCanvas || !fgCanvas) return;

    const arena = getArena();
    const loop = new GameLoop(
      bgCanvas,
      fgCanvas,
      arena,
      matchSettings,
      activePlayers,
      (winner, state) => {
        setTimeout(() => {
          setMatchResult(winner, state);
        }, 1500);
      },
    );

    gameLoopRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
      gameLoopRef.current = null;
    };
  }, [activePlayers, matchSettings, setMatchResult]);

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
              <h2 className="pause-title">{t('pause_title')}</h2>
              <button className="pause-btn resume-btn" onClick={handleResume} data-testid="resume-button">
                {t('pause_resume')}
              </button>
              <button className="pause-btn quit-btn" onClick={handleQuit} data-testid="quit-button">
                {t('pause_quit')}
              </button>
              <p className="pause-hint">{t('pause_hint')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
