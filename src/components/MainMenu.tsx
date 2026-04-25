import { useEffect, useRef, useCallback, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { audio } from '../engine/audio';
import { ArenaGrid } from './ArenaGrid';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';
import { isTouchPrimary } from '../engine/touchDetect';
import { getSlowDevice, subscribeSlowDevice } from '../engine/perfFlags';
import { useCanvasRenderScale } from '../hooks/useCanvasRenderScale';
import { drawMenuBackground } from './menuBackground';
import { HelpModal } from './HelpModal';
import { ModsModal } from './ModsModal';
import { OnlineModal } from './OnlineModal';
import logoImg from '/logo.png?url';
import './MainMenu.css';

export function MainMenu() {
  const { t, i18n } = useTranslation();
  const { setScreen, matchSettings, setMatchSettings } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const [modsOpen, setModsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const slowDevice = useSyncExternalStore(subscribeSlowDevice, getSlowDevice);

  // Mobile: ensure at least 1 bot (single player needs opponents)
  useEffect(() => {
    if (isTouchPrimary() && matchSettings.botCount < 1) {
      setMatchSettings({ botCount: 1 });
    }
  }, []);

  const handlePlay = useCallback(() => {
    audio.init();
    audio.play('select');
    setScreen('charSelect');
  }, [setScreen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !onlineOpen) {
        e.preventDefault();
        handlePlay();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handlePlay, onlineOpen]);

  const [musicOff, setMusicOff] = useState(() => audio.isMusicDisabled());

  useEffect(() => {
    audio.playMenuMusic();
    // Mobile browsers block autoplay until a user gesture. Retry on first
    // interaction — playMenuMusic() no-ops if music already started.
    const retry = () => audio.playMenuMusic();
    document.addEventListener('pointerdown', retry, { once: true });
    document.addEventListener('keydown', retry, { once: true });
    // Defer heavy procedural sound generation so it doesn't block music start
    setTimeout(() => audio.init(), 0);
    return () => {
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('keydown', retry);
    };
  }, []);

  useCanvasRenderScale(canvasRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const loop = () => {
      drawMenuBackground(ctx);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="main-menu" data-testid="main-menu">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="menu-bg-canvas" />
      <div className="menu-bg">
        <div className={`menu-content${slowDevice ? ' menu-content--no-blur' : ''}`}>
          <button
            className="overlay-icon-btn music-toggle-btn"
            onClick={() => {
              const disabled = audio.toggleMusicDisabled();
              setMusicOff(disabled);
              if (!disabled) audio.playMenuMusic();
            }}
            title={musicOff ? t('music_on') : t('music_off')}
          >
            {musicOff ? '\uD83D\uDD07' : '\uD83C\uDFB5'}
          </button>
          <img src={logoImg} alt="Carrot Royale" className="game-logo" />
          <p className="tagline">{t('tagline')}</p>
          <p className="controls-hint">{t('credits_players')}</p>

          <div className="menu-buttons">
            <button className="btn-base menu-btn play-btn" onClick={handlePlay} data-testid="play-button">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              {t('play_local', 'Play Local')}
            </button>
            <button className="btn-base menu-btn online-btn" data-testid="online-btn" onClick={() => { audio.init(); audio.play('select'); setOnlineOpen(true); }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              {t('online', 'Online')}
            </button>
          </div>

          <div className="arena-selector" data-testid="arena-selector">
            <span className="arena-label">{t('arena_label')}</span>
            <div className="arena-options">
              <ArenaGrid
                classPrefix="arena"
                currentId={matchSettings.arenaId}
                onSelect={(id) => { audio.init(); audio.play('select'); setMatchSettings({ arenaId: id }); }}
              />
              <button
                className={`arena-btn ${matchSettings.arenaId === 'random' ? 'selected' : ''}`}
                onClick={() => {
                  audio.init();
                  audio.play('select');
                  setMatchSettings({ arenaId: 'random' });
                }}
              >
                <div className="arena-preview arena-preview-random">
                  <span className="arena-icon">🎲</span>
                </div>
                <span className="arena-name">{t('arena_random')}</span>
              </button>
            </div>
          </div>

          <div className="menu-settings">
            <div className="bot-settings" data-testid="bot-settings">
              <div className="bot-count-row">
                <span className="bot-label">{t('bot_label')}</span>
                <button
                  className="bot-btn"
                  onClick={() => setMatchSettings({ botCount: Math.max(isTouchPrimary() ? 1 : 0, matchSettings.botCount - 1) })}
                  disabled={matchSettings.botCount <= (isTouchPrimary() ? 1 : 0)}
                >-</button>
                <span className="bot-count" data-testid="bot-count">{matchSettings.botCount}</span>
                <button
                  className="bot-btn"
                  onClick={() => setMatchSettings({ botCount: Math.min(5, matchSettings.botCount + 1) })}
                  disabled={matchSettings.botCount >= 5}
                >+</button>
              </div>
              {matchSettings.botCount > 0 && (
                <div className="bot-difficulty-row">
                  {(['easy', 'medium', 'hard', 'impossible'] as const).map(d => (
                    <button
                      key={d}
                      className={`difficulty-btn ${matchSettings.botDifficulty === d ? 'selected' : ''}`}
                      onClick={() => setMatchSettings({ botDifficulty: d })}
                    >
                      {t(`bot_diff_${d}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="gore-toggle">
            <input
              type="checkbox"
              checked={matchSettings.goreMode}
              onChange={(e) => setMatchSettings({ goreMode: e.target.checked })}
              data-testid="gore-toggle"
            />
            <span>{t('blood_mode')}</span>
          </label>
          <div className="lang-toggle">
            {[
              { code: 'en', label: 'EN', flag: <><rect width="60" height="40" fill="#012169"/><path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="7"/><path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4"/><path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="10"/><path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="6"/></> },
              { code: 'cs', label: 'CS', flag: <><rect width="60" height="20" fill="#fff"/><rect y="20" width="60" height="20" fill="#D7141A"/><polygon points="0,0 30,20 0,40" fill="#11457E"/></> },
              { code: 'hi', label: 'HI', flag: <><rect width="60" height="13.3" fill="#FF9933"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><rect y="26.7" width="60" height="13.3" fill="#138808"/><circle cx="30" cy="20" r="4" fill="none" stroke="#000080" strokeWidth="0.8"/></> },
              { code: 'fil', label: 'FIL', flag: <><rect width="60" height="20" fill="#0038A8"/><rect y="20" width="60" height="20" fill="#CE1126"/><polygon points="0,0 28,20 0,40" fill="#fff"/><circle cx="9" cy="20" r="3" fill="none" stroke="#FCD116" strokeWidth="0.8"/></> },
            ].map((lang, i) => (
              <span key={lang.code}>
                {i > 0 && ' | '}
                <span
                  onClick={() => i18n.changeLanguage(lang.code)}
                  style={{ fontWeight: i18n.language === lang.code ? 'bold' : 'normal', opacity: i18n.language === lang.code ? 1 : 0.6 }}
                >
                  <svg width="18" height="12" viewBox="0 0 60 40" style={{ verticalAlign: 'middle', marginRight: 4 }}>{lang.flag}</svg>
                  {lang.label}
                </span>
              </span>
            ))}
          </div>
          <button className="btn-base help-btn" onClick={() => { audio.init(); audio.play('select'); setHelpOpen(true); }}>
            {t('help_button')}
          </button>
          <button className="btn-base mods-btn" onClick={() => { audio.init(); audio.play('select'); setModsOpen(true); }}>
            {t('mods_button')}
          </button>
          {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
          {modsOpen && <ModsModal onClose={() => setModsOpen(false)} />}
          {onlineOpen && <OnlineModal onClose={() => setOnlineOpen(false)} />}
        </div>
        <div className="build-info">
          {new Date(__BUILD_TIME__).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          {' '}
          {new Date(__BUILD_TIME__).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
