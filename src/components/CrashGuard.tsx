import { Component, useEffect, useState, type ReactNode } from 'react';
import { reportFatalError, subscribeFatalError, getFatalError } from '../fatalError';
import './CrashGuard.css';

// Chromium fires this benign message on window.error; it is not a crash.
const BENIGN = /ResizeObserver loop/i;

function CrashOverlay({ message }: { message: string }) {
  return (
    <div className="crash-overlay" role="alert">
      <div className="crash-panel">
        <h2>Something went wrong</h2>
        <p>The game hit an unexpected error and needs to reload.</p>
        <button className="btn-base crash-reload" onClick={() => window.location.reload()}>
          Reload
        </button>
        <details className="crash-details">
          <summary>Details</summary>
          <pre>{message}</pre>
        </details>
      </div>
    </div>
  );
}

/** Catches throws from the React subtree (render + effects). */
class ReactErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { reportFatalError(error?.message || String(error)); }
  render() { return this.state.hasError ? null : this.props.children; }
}

/**
 * Wraps the app. Surfaces a recovery overlay for three otherwise-silent
 * failure classes:
 *  - React render/effect throws (ErrorBoundary → root unmount is worse than an
 *    overlay: React 19 blanks the page with no ErrorBoundary present).
 *  - Uncaught main-thread errors (a thrown rAF frame in the game/net loop
 *    propagates to window.onerror; the loop stops rescheduling silently).
 *  - Worker crashes (proxies call reportFatalError from their onError).
 */
export function CrashGuard({ children }: { children: ReactNode }) {
  const [fatal, setFatal] = useState<string | null>(getFatalError());

  useEffect(() => subscribeFatalError((m) => setFatal(m)), []);

  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      if (e?.message && BENIGN.test(e.message)) return;
      reportFatalError(e?.message || 'Unknown error');
    };
    const onRej = (e: PromiseRejectionEvent) => {
      const reason = e?.reason;
      reportFatalError(reason?.message || String(reason ?? 'Unhandled rejection'));
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

  return (
    <>
      <ReactErrorBoundary>{children}</ReactErrorBoundary>
      {fatal && <CrashOverlay message={fatal} />}
    </>
  );
}
