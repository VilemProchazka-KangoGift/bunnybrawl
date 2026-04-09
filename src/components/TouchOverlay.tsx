import { useEffect, useRef } from 'react';
import type { TouchInputManager } from '../engine/touchInput';
import './TouchOverlay.css';

interface TouchOverlayProps {
  touchInput: TouchInputManager;
}

export function TouchOverlay({ touchInput }: TouchOverlayProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fade out hint after 3 seconds
    const hintTimer = setTimeout(() => {
      if (hintRef.current) hintRef.current.style.display = 'none';
    }, 3000);

    // Direct DOM updates — bypass React for 60-120Hz touch events
    touchInput.setCallbacks(
      (data) => {
        if (baseRef.current) {
          baseRef.current.style.display = data.active ? '' : 'none';
          baseRef.current.style.left = data.baseX + 'px';
          baseRef.current.style.top = data.baseY + 'px';
        }
        if (thumbRef.current) {
          thumbRef.current.style.display = data.active ? '' : 'none';
          thumbRef.current.style.left = data.thumbX + 'px';
          thumbRef.current.style.top = data.thumbY + 'px';
        }
      },
      (active) => {
        if (flashRef.current) {
          flashRef.current.style.display = active ? '' : 'none';
        }
        // Dismiss hint on first jump
        if (active && hintRef.current) {
          hintRef.current.style.display = 'none';
        }
      },
    );

    return () => {
      touchInput.clearCallbacks();
      clearTimeout(hintTimer);
    };
  }, [touchInput]);

  return (
    <div className="touch-overlay">
      <div ref={hintRef} className="touch-jump-hint" />
      <div ref={flashRef} className="touch-jump-flash" style={{ display: 'none' }} />
      <div ref={baseRef} className="touch-joystick-base" style={{ display: 'none' }} />
      <div ref={thumbRef} className="touch-joystick-thumb" style={{ display: 'none' }} />
    </div>
  );
}
