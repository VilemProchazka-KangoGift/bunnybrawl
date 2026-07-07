/**
 * Global fatal-error surface. Without this, a crashed rAF loop, a worker
 * exception, or a React render/effect throw freezes the canvas silently —
 * music keeps looping and the player has no idea the game died. Any code can
 * report here; `CrashGuard` renders a recovery overlay and offers a reload.
 *
 * First error wins (we don't spam the overlay if a broken frame throws 60×/s).
 */
type Listener = (msg: string) => void;

let _current: string | null = null;
const _listeners = new Set<Listener>();

export function reportFatalError(msg: string): void {
  if (_current) return; // first error wins
  _current = msg;
  for (const l of _listeners) {
    try { l(msg); } catch { /* a listener throwing must not mask the original */ }
  }
}

export function getFatalError(): string | null {
  return _current;
}

export function subscribeFatalError(cb: Listener): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}
