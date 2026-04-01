import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { audio } from '../engine/audio';
import { listArenas } from '../engine/arena';
import { listThemes } from '../engine/themes/registry';
import './MainMenu.css';

export function MainMenu() {
  const { t, i18n } = useTranslation();
  const { setScreen, matchSettings, setMatchSettings } = useGameStore();

  const handlePlay = () => {
    audio.init();
    audio.play('select');
    setScreen('charSelect');
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePlay();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="main-menu" data-testid="main-menu">
      <div className="menu-bg">
        <div className="menu-content">
          <h1 className="game-title">
            <span className="title-bunny">{t('title_bunny')}</span>
            <span className="title-brawl">{t('title_brawl')}</span>
          </h1>
          <p className="tagline">{t('tagline')}</p>

          <div className="menu-buttons">
            <button className="menu-btn play-btn" onClick={handlePlay} data-testid="play-button">
              {t('play')}
            </button>
          </div>

          <div className="arena-selector" data-testid="arena-selector">
            <span className="arena-label">{t('arena_label')}</span>
            <div className="arena-options">
              <button
                className={`arena-option ${matchSettings.arenaId === 'random' ? 'selected' : ''}`}
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
              {(() => {
                const arenas = listArenas();
                const themes = listThemes();
                return arenas.map(a => {
                  const theme = themes.find(th => th.id === a.themeId);
                  return (
                    <button
                      key={a.id}
                      className={`arena-option ${matchSettings.arenaId === a.id ? 'selected' : ''}`}
                      onClick={() => {
                        audio.init();
                        audio.play('select');
                        setMatchSettings({ arenaId: a.id });
                      }}
                    >
                      <div className="arena-preview" style={{ background: theme?.previewGradient || '#333' }}>
                        <span className="arena-icon">{theme?.previewIcon || ''}</span>
                      </div>
                      <span className="arena-name">{t(theme?.nameKey || a.name)}</span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          <div className="menu-settings">
            <label className="gore-toggle">
              <input
                type="checkbox"
                checked={matchSettings.goreMode}
                onChange={(e) => setMatchSettings({ goreMode: e.target.checked })}
                data-testid="gore-toggle"
              />
              <span>{t('blood_mode')}</span>
            </label>

            <div className="bot-settings" data-testid="bot-settings">
              <div className="bot-count-row">
                <span className="bot-label">{t('bot_label')}</span>
                <button
                  className="bot-btn"
                  onClick={() => setMatchSettings({ botCount: Math.max(0, matchSettings.botCount - 1) })}
                  disabled={matchSettings.botCount <= 0}
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

          <div className="credits">
            <p>{t('credits_tribute')}</p>
            <p className="controls-hint">{t('credits_players')}</p>
            <p className="lang-toggle" style={{ marginTop: '8px', cursor: 'pointer', fontSize: '14px', opacity: 0.7 }}>
              <span
                onClick={() => i18n.changeLanguage('en')}
                style={{ fontWeight: i18n.language === 'en' ? 'bold' : 'normal', opacity: i18n.language === 'en' ? 1 : 0.6 }}
              >
                EN
              </span>
              {' | '}
              <span
                onClick={() => i18n.changeLanguage('cs')}
                style={{ fontWeight: i18n.language === 'cs' ? 'bold' : 'normal', opacity: i18n.language === 'cs' ? 1 : 0.6 }}
              >
                CS
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
