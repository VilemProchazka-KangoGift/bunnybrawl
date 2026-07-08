import { Component, useEffect, useState, type ReactNode } from 'react';
import './CrashGuard.css';

// Not our crashes: Chromium's ResizeObserver-loop notice, and the opaque
// cross-origin "Script error." that browser extensions / third-party scripts
// surface (never actionable, and not a game-loop failure).
const BENIGN = /ResizeObserver loop|^Script error\.?$/i;

function CrashOverlay({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="crash-overlay" role="alert">
      <div className="crash-panel">
        <h2>Something went wrong</h2>
        <p>The game hit an unexpected error.</p>
        <div className="crash-actions">
          <button className="btn-base crash-reload" onClick={() => window.location.reload()}>
            Reload
          </button>
          {onDismiss && (
            <button className="btn-base crash-dismiss" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
        <details className="crash-details">
          <summary>Details</summary>
          <pre>{message}</pre>
        </details>
      </div>
    </div>
  );
}

/**
 * Catches throws from the React subtree (render + effects). A React 19
 * render/effect throw otherwise unmounts the whole root → permanent blank page.
 * The tree is unrecoverable, so the overlay offers Reload only (no dismiss).
 */
class ReactErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error?.message || String(error) };
  }
  componentDidCatch(error: Error): void { console.error('[crash]', error); }
  render(): ReactNode {
    if (this.state.error !== null) return <CrashOverlay message={this.state.error} />;
    return this.props.children;
  }
}

/**
 * Wraps the app with two complementary crash surfaces:
 *
 *  1. A React ErrorBoundary for render/effect throws (unrecoverable → Reload).
 *
 *  2. A narrow `window.error` listener for uncaught throws in the imperative
 *     rAF game/net loops. React never sees those (they're outside render), so
 *     without this a thrown frame stops the loop and freezes the canvas with no
 *     affordance. DELIBERATELY does NOT listen to `unhandledrejection`: routine
 *     WebRTC/Trystero renegotiation and Howler autoplay-policy rejections fire
 *     that constantly, and escalating them to a full-screen overlay covers a
 *     playable game. Uncaught *synchronous* throws (window 'error') are rare and
 *     usually our own loop bugs; the overlay is DISMISSABLE so a rare transient
 *     third-party throw isn't session-ending.
 */
export function CrashGuard({ children }: { children: ReactNode }) {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      if (e?.message && BENIGN.test(e.message)) return;
      setRuntimeError(prev => prev ?? (e?.message || 'Unknown error'));
    };
    window.addEventListener('error', onErr);
    return () => window.removeEventListener('error', onErr);
  }, []);

  return (
    <ReactErrorBoundary>
      {children}
      {runtimeError && (
        <CrashOverlay message={runtimeError} onDismiss={() => setRuntimeError(null)} />
      )}
    </ReactErrorBoundary>
  );
}
