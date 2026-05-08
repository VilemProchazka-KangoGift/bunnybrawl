import { useEffect } from 'react';
import type { GameLoop } from '../../engine/gameLoop';

/** Match-level keyboard shortcuts:
 *  - Escape: dismiss arena selector → toggle pause/resume
 *  - Enter:  resume from pause → otherwise skip countdown
 *  Plus a beforeunload prompt so navigating away during a match warns.
 */
export function useMatchKeyboard(
  gameLoopRef: React.RefObject<GameLoop | null>,
  showLevelSelect: boolean,
  setShowLevelSelect: (b: boolean) => void,
  handlePause: () => void,
  handleResume: () => void,
): void {
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
  }, [gameLoopRef, handleResume, handlePause, showLevelSelect, setShowLevelSelect]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
