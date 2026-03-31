import type { ReactNode } from 'react';
import { useScaler } from '../hooks/useScaler';
import './GameScaler.css';

interface GameScalerProps {
  children: ReactNode;
}

export function GameScaler({ children }: GameScalerProps) {
  const { containerRef, isFullscreen, toggleFullscreen } = useScaler();

  return (
    <div className="game-scaler-viewport">
      <div className="game-scaler-content" ref={containerRef}>
        {children}
      </div>
      <button
        className="fullscreen-btn"
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? '\u2935' : '\u2922'}
      </button>
    </div>
  );
}
