import { useRef, useState, useEffect, useCallback } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';

export function useScaler() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const updateScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scale = Math.min(
      window.innerWidth / CANVAS_WIDTH,
      window.innerHeight / CANVAS_HEIGHT
    );
    el.style.transform = `scale(${scale})`;
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      }
    } else {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void>;
      };
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
    }
  }, []);

  useEffect(() => {
    updateScale();

    const onResize = () => updateScale();
    window.addEventListener('resize', onResize);

    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Recalculate scale after fullscreen change
      requestAnimationFrame(updateScale);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [updateScale, toggleFullscreen]);

  return { containerRef, isFullscreen, toggleFullscreen };
}
