import { useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { GameLoop } from '../engine/gameLoop';
import { getArena } from '../engine/arena';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import './Match.css';

export function Match() {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<GameLoop | null>(null);
  const { activePlayers, matchSettings, setMatchResult } = useGameStore();

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
        // Small delay so victory sound can play
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
      </div>
    </div>
  );
}
