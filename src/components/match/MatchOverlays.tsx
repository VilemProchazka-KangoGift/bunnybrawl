import { useTranslation } from 'react-i18next';
import { ArenaGrid } from '../ArenaGrid';
import { loadingSubKey } from './useLoadingOverlay';
import logoImg from '/logo.png?url';

/**
 * Presentational overlay layer for Match: pause menu (with arena-select
 * sub-state), loading overlay (with cancel button + sub-text), the online
 * unstable/banner pill, the reconnecting overlay, and the reconnect-failed
 * flash overlay.
 *
 * No effects, no refs — JSX in, JSX out. The orchestrator (Match.tsx)
 * owns all the state and passes it through.
 */
export interface MatchOverlaysProps {
  // Pause / level select state
  paused: boolean;
  showLevelSelect: boolean;
  currentArenaId: string;
  setShowLevelSelect: (b: boolean) => void;
  handleResume: () => void;
  handleQuit: () => void;
  handleChangeArena: (id: string) => void;

  // Online flags
  isOnline: boolean;
  isHost: boolean;

  // Loading overlay
  showLoadingOverlay: boolean;
  showLoadingCancel: boolean;
  phaseIsLoading: boolean;
  localTasksDone: boolean;

  // Connection / unstable banner
  unstable: { kind: 'mine' } | { kind: 'them'; name: string } | null;
  banner: string | null;

  // Reconnecting overlay
  isReconnecting: boolean;
  reconnectAttempt: number;
  reconnectMax: number;
  reconnectFailed: boolean;
}

export function MatchOverlays(p: MatchOverlaysProps) {
  const { t } = useTranslation();
  const {
    paused, showLevelSelect, currentArenaId,
    setShowLevelSelect, handleResume, handleQuit, handleChangeArena,
    isOnline, isHost,
    showLoadingOverlay, showLoadingCancel, phaseIsLoading, localTasksDone,
    unstable, banner,
    isReconnecting, reconnectAttempt, reconnectMax, reconnectFailed,
  } = p;

  return (
    <>
      {showLoadingOverlay && (
        <div
          className="match-loading-overlay"
          data-testid="match-loading-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <img src={logoImg} alt="Carrot Royale" className="match-loading-logo" />
          <div className="match-loading-spinner" />
          <div className="match-loading-text">{t('loading', 'Loading...')}</div>
          <div className="match-loading-sub" data-testid="match-loading-sub">
            {loadingSubKey(isOnline, localTasksDone, phaseIsLoading) === 'loading_waiting_others'
              ? t('loading_waiting_others', 'Waiting for other players...')
              : t('loading_arena', 'Loading arena...')}
          </div>
          {showLoadingCancel && (
            <button
              className="btn-base pause-btn quit-btn match-loading-cancel"
              onClick={handleQuit}
              data-testid="match-loading-cancel"
            >
              {t('loading_cancel', 'Cancel')}
            </button>
          )}
        </div>
      )}
      {paused && (
        <div className="pause-overlay" data-testid="pause-menu">
          <div className="pause-box">
            {showLevelSelect ? (
              <>
                <h2 className="pause-title">{t('pause_change_level')}</h2>
                <div className="pause-arena-grid">
                  <ArenaGrid
                    classPrefix="pause-arena"
                    currentId={currentArenaId}
                    selectedClass="current"
                    onSelect={handleChangeArena}
                  />
                </div>
                <button className="btn-base pause-btn quit-btn" onClick={() => setShowLevelSelect(false)}>
                  {t('pause_back')}
                </button>
              </>
            ) : isOnline ? (
              /* Online pause menu */
              <>
                <h2 className="pause-title">{t('pause_title')}</h2>
                <button className="btn-base pause-btn resume-btn" onClick={handleResume} data-testid="resume-button">
                  {t('pause_resume')}
                </button>
                {isHost && (
                  <button className="btn-base pause-btn level-btn" onClick={() => setShowLevelSelect(true)}>
                    {t('pause_change_level')}
                  </button>
                )}
                {isHost ? (
                  <button className="btn-base pause-btn quit-btn" onClick={handleQuit} data-testid="quit-button">
                    {t('cancel_game', 'Cancel Game')}
                  </button>
                ) : (
                  <button className="btn-base pause-btn quit-btn" onClick={handleQuit} data-testid="quit-button">
                    {t('leave_game', 'Leave Game')}
                  </button>
                )}
              </>
            ) : (
              /* Local pause menu */
              <>
                <h2 className="pause-title">{t('pause_title')}</h2>
                <button className="btn-base pause-btn resume-btn" onClick={handleResume} data-testid="resume-button">
                  {t('pause_resume')}
                </button>
                <button className="btn-base pause-btn level-btn" onClick={() => setShowLevelSelect(true)}>
                  {t('pause_change_level')}
                </button>
                <button className="btn-base pause-btn quit-btn" onClick={handleQuit} data-testid="quit-button">
                  {t('pause_quit')}
                </button>
                <p className="pause-hint">{t('pause_hint')}</p>
              </>
            )}
          </div>
        </div>
      )}
      {!paused && isOnline && (() => {
        // Unstable-indicator slot: unstable takes priority over the transient
        // banner when both would show simultaneously.
        if (unstable && !isReconnecting) return (
          <div
            className="connection-unstable-indicator"
            data-testid={unstable.kind === 'mine' ? 'connection-unstable' : 'connection-unstable-them'}
            role="status"
            aria-live="polite"
          >
            {unstable.kind === 'mine'
              ? t('connection_unstable_mine', 'Your connection is unstable')
              : t('connection_unstable_them', '{{name}} has a slow connection', { name: unstable.name })}
          </div>
        );
        if (banner) return (
          <div className="connection-unstable-indicator" data-testid="disconnect-banner" role="status" aria-live="polite">
            {banner}
          </div>
        );
        return null;
      })()}
      {isReconnecting && isOnline && (
        <div className="reconnecting-overlay" role="status" aria-live="polite">
          <div className="reconnecting-box">
            <div className="reconnecting-spinner" />
            <div className="reconnecting-text">
              {t('reconnecting', 'Reconnecting...')}
            </div>
            {reconnectAttempt > 0 && (
              <div className="reconnecting-sub">
                {t('reconnecting_attempt', 'Attempt {{n}}/{{max}}', { n: reconnectAttempt, max: reconnectMax })}
              </div>
            )}
            <button className="btn-base pause-btn quit-btn" onClick={handleQuit} data-testid="reconnect-give-up">
              {t('give_up', 'Give Up')}
            </button>
          </div>
        </div>
      )}
      {reconnectFailed && isOnline && (
        <div className="reconnecting-overlay" data-testid="reconnect-failed" role="alert" aria-live="assertive">
          <div className="reconnecting-box">
            <div className="reconnecting-text">
              {t('reconnect_failed', 'Could not reconnect.')}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
