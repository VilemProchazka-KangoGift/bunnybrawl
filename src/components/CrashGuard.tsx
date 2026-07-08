import { Component, type ReactNode } from 'react';
import './CrashGuard.css';

interface State { error: string | null }

/**
 * Catches throws from the React subtree (render + effects). Without a boundary,
 * a React 19 render/effect throw unmounts the whole root → permanent blank
 * page; here it shows a reload overlay instead.
 *
 * DELIBERATELY does NOT install global `window` 'error'/'unhandledrejection'
 * handlers: routine WebRTC/Trystero renegotiation and Howler autoplay-policy
 * rejections fire those constantly, and escalating them to a full-screen,
 * first-error-wins overlay covered a fully-playable game with no way out but a
 * reload. A broken React tree, by contrast, genuinely cannot recover without a
 * reload — so a persistent overlay is correct for that case only. (Worker
 * onError is likewise logged, not escalated — the worker's per-frame try/catch
 * often recovers.)
 */
export class CrashGuard extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error?.message || String(error) };
  }

  componentDidCatch(error: Error): void {
    console.error('[crash]', error);
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
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
            <pre>{this.state.error}</pre>
          </details>
        </div>
      </div>
    );
  }
}
