import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { audio } from '../engine/audio';
import { CharacterSelectorModal } from './CharacterSelectorModal';

interface SettingsModalProps {
  onClose: () => void;
}

const DEFAULT_UNMUTE_VOLUME = 0.5;

// Hoisted so useSyncExternalStore sees stable identities — re-binding per
// render would re-subscribe the listener every render.
const subscribeMusic = (l: () => void) => audio.subscribeMusic(l);
const getMusicDisabled = () => audio.isMusicDisabled();
const getMusicVolume = () => audio.getMusicVolume();

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const [charSelectorOpen, setCharSelectorOpen] = useState(false);
  const musicOff = useSyncExternalStore(subscribeMusic, getMusicDisabled);
  const volume = useSyncExternalStore(subscribeMusic, getMusicVolume);

  const toggleMusic = () => {
    const willUnmute = audio.isMusicDisabled();
    if (willUnmute && audio.getMusicVolume() === 0) {
      // Icon-unmute when slider is at 0 would be silent; restore a default.
      audio.setMusicVolume(DEFAULT_UNMUTE_VOLUME);
    }
    const disabled = audio.toggleMusicDisabled();
    if (!disabled) audio.playMenuMusic();
  };

  const onVolumeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    audio.setMusicVolume(v);
    const wantMuted = v === 0;
    if (wantMuted !== musicOff) {
      audio.setMusicDisabled(wantMuted);
      if (!wantMuted) audio.playMenuMusic();
    }
  };

  return (
    <>
      <div className="mods-overlay" onClick={onClose}>
        <div className="mods-modal settings-modal" onClick={e => e.stopPropagation()}>
          <h2 className="mods-title">{t('settings_title')}</h2>
          <div className="settings-row">
            <button
              type="button"
              className="settings-music-icon"
              onClick={toggleMusic}
              title={musicOff ? t('music_on') : t('music_off')}
              aria-label={musicOff ? t('music_on') : t('music_off')}
            >
              {musicOff ? '🔇' : '🎵'}
            </button>
            <input
              type="range"
              className={`settings-volume-slider${musicOff ? ' settings-volume-slider--muted' : ''}`}
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={onVolumeInput}
              aria-label={t('settings_music_volume')}
            />
            <span className="settings-volume-value">{Math.round(volume * 100)}</span>
          </div>
          <div className="settings-row">
            <button
              className="btn-base settings-char-btn"
              onClick={() => setCharSelectorOpen(true)}
            >
              {t('char_selector_button')}
            </button>
          </div>
          <button className="btn-base mods-close-btn" onClick={onClose}>
            {t('mods_close')}
          </button>
        </div>
      </div>
      {charSelectorOpen && (
        <CharacterSelectorModal onClose={() => setCharSelectorOpen(false)} />
      )}
    </>
  );
}
