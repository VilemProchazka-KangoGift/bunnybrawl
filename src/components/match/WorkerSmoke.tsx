import { useEffect, useRef, useState } from 'react';
import { WorkerHost } from '../../engine/worker';

const SMOKE_W = 160;
const SMOKE_H = 90;

/**
 * Phase 2 smoke overlay — production validation that Vite's worker bundle
 * + transferControlToOffscreen + RAF-in-worker actually work in the real
 * Match.tsx lifecycle. Mounts a small corner canvas, transfers it to a
 * WorkerHost, and the worker draws the colored-rect placeholder from
 * renderWorker.ts.
 *
 * Rendered only when `?workerSmoke=1` is in the URL — zero cost otherwise.
 *
 * This is intentionally a sibling overlay, NOT a replacement for the game
 * canvases. Phase 3 migrates the Renderer + Simulator into the worker for
 * real; this smoke gate lets us land the production worker pipeline
 * incrementally so any worker-bundle / Vite config / lifecycle bugs surface
 * without breaking the actual game.
 */
export function WorkerSmoke() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<WorkerHost | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const host = new WorkerHost({
      onReady: () => setReady(true),
      onError: (m) => setError(m),
    });
    hostRef.current = host;
    try {
      host.attachCanvas(canvasRef.current, SMOKE_W, SMOKE_H);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      host.destroy();
      hostRef.current = null;
    };
  }, []);

  return (
    <div
      data-testid="worker-smoke"
      data-ready={ready ? '1' : '0'}
      data-error={error ?? ''}
      style={{
        position: 'absolute',
        left: 8,
        bottom: 8,
        zIndex: 50,
        pointerEvents: 'none',
        outline: '1px solid rgba(255,255,255,0.5)',
        background: '#222',
      }}
    >
      <canvas
        ref={canvasRef}
        width={SMOKE_W}
        height={SMOKE_H}
        style={{ display: 'block', width: SMOKE_W, height: SMOKE_H }}
      />
    </div>
  );
}

/** True when the URL has `?workerSmoke=1`. Read-once at import time. */
export function isWorkerSmokeRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('workerSmoke') === '1';
  } catch {
    return false;
  }
}
