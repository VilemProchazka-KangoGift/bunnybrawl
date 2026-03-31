import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useScaler } from '../hooks/useScaler';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import './GameScaler.css';

const ICON_ENTER_FULLSCREEN = '\u2922';
const ICON_EXIT_FULLSCREEN = '\u2935';

interface GameScalerProps {
  children: ReactNode;
}

export function GameScaler({ children }: GameScalerProps) {
  const { containerRef, isFullscreen, toggleFullscreen } = useScaler();
  const { t } = useTranslation();

  return (
    <div className="game-scaler-viewport">
      <div
        className="game-scaler-content"
        ref={containerRef}
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
      >
        {children}
      </div>
      <button
        className="fullscreen-btn"
        onClick={toggleFullscreen}
        title={isFullscreen ? t('fullscreen_exit') : t('fullscreen_enter')}
      >
        {isFullscreen ? ICON_EXIT_FULLSCREEN : ICON_ENTER_FULLSCREEN}
      </button>
    </div>
  );
}
