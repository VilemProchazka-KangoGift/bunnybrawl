import { useRef, useState, useEffect, useCallback } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { isTouchPrimary } from '../engine/touchDetect';

export function useScaler() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);

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

    // Lock to landscape on mobile (progressive — fails silently where unsupported)
    let autoFullscreen: (() => void) | null = null;
    if (isTouchPrimary()) {
      (screen.orientation as any)?.lock?.('landscape')?.catch?.(() => {});

      // Auto-fullscreen on first user tap — reuses toggleFullscreen() which has webkit fallback
      autoFullscreen = () => { toggleFullscreen(); };
      document.addEventListener('touchstart', autoFullscreen, { once: true });
    }

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateScale, 100);
    };
    window.addEventListener('resize', onResize);

    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
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
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown);
      if (autoFullscreen) document.removeEventListener('touchstart', autoFullscreen);
    };
  }, [updateScale, toggleFullscreen]);

  return { containerRef, isFullscreen, toggleFullscreen };
}
