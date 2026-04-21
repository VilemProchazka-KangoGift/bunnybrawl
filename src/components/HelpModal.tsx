// Help modal — static how-to-play content. Pure presentational, no state.

import { useTranslation } from 'react-i18next';

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  const { t } = useTranslation();
  return (
    <div className="mods-overlay" onClick={onClose}>
      <div className="help-modal" onClick={e => e.stopPropagation()}>
        <h2 className="mods-title">{t('help_title')}</h2>
        <div className="help-sections">
          <div className="help-section">
            <h3 className="help-section-title">{t('help_goal_title')}</h3>
            <p className="help-text">{t('help_goal')}</p>
          </div>
          <div className="help-section">
            <h3 className="help-section-title">{t('help_scoring_title')}</h3>
            <p className="help-text">{t('help_scoring')}</p>
          </div>
          <div className="help-section">
            <h3 className="help-section-title">{t('help_controls_title')}</h3>
            <div className="help-controls-grid">
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} className="help-control-line">{t(`help_controls_p${n}`)}</span>
              ))}
            </div>
            <p className="help-text help-controls-note">{t('help_controls_note')}</p>
          </div>
          <div className="help-section">
            <h3 className="help-section-title">{t('help_pickups_title')}</h3>
            <p className="help-text">{t('help_pickups_carrots')}</p>
            <p className="help-text">{t('help_pickups_springs')}</p>
            <p className="help-text">{t('help_pickups_thorns')}</p>
            <p className="help-text">{t('help_pickups_falloff')}</p>
          </div>
          <div className="help-section">
            <h3 className="help-section-title">{t('help_lobby_title')}</h3>
            <p className="help-text">{t('help_lobby')}</p>
          </div>
          <div className="help-section">
            <h3 className="help-section-title">{t('help_options_title')}</h3>
            <p className="help-text">{t('help_options_arena')}</p>
            <p className="help-text">{t('help_options_bots')}</p>
            <p className="help-text">{t('help_options_blood')}</p>
            <p className="help-text">{t('help_options_mods')}</p>
          </div>
          <div className="help-section">
            <h3 className="help-section-title">{t('help_online_title')}</h3>
            <p className="help-text">{t('help_online_desc')}</p>
            <p className="help-text">{t('help_online_steps')}</p>
          </div>
          <div className="help-section">
            <h3 className="help-section-title">{t('help_tips_title')}</h3>
            <p className="help-text">{t('help_tips')}</p>
          </div>
        </div>
        <button className="btn-base mods-close-btn" onClick={onClose}>
          {t('help_close')}
        </button>
      </div>
    </div>
  );
}
