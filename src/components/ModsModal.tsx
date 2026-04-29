// Match mods modal — toggles for gameplay modifiers persisted via gameStore.

import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';
import { getSlowDeviceUserPref, setSlowDevice, subscribeSlowDevice } from '../engine/perfFlags';

interface ModsModalProps {
  onClose: () => void;
}

const MOD_LIST = [
  { key: 'extremeGore', name: 'mod_extreme_gore', desc: 'mod_extreme_gore_desc' },
  { key: 'carrotChase', name: 'mod_carrot_chase', desc: 'mod_carrot_chase_desc' },
  { key: 'giantPlayers', name: 'mod_giant_players', desc: 'mod_giant_players_desc' },
  { key: 'turbo', name: 'mod_turbo', desc: 'mod_turbo_desc' },
  { key: 'superBounce', name: 'mod_super_bounce', desc: 'mod_super_bounce_desc' },
  { key: 'mirrorArena', name: 'mod_mirror', desc: 'mod_mirror_desc' },
  { key: 'underwaterGravity', name: 'mod_underwater_gravity', desc: 'mod_underwater_gravity_desc' },
] as const;

export function ModsModal({ onClose }: ModsModalProps) {
  const { t } = useTranslation();
  const { matchSettings, setMatchSettings } = useGameStore();
  const slowDevice = useSyncExternalStore(subscribeSlowDevice, getSlowDeviceUserPref);
  return (
    <div className="mods-overlay" onClick={onClose}>
      <div className="mods-modal" onClick={e => e.stopPropagation()}>
        <h2 className="mods-title">{t('mods_title')}</h2>
        {MOD_LIST.map(mod => (
          <div className="mod-row" key={mod.key}>
            <label className="mod-toggle">
              <input
                type="checkbox"
                checked={matchSettings.mods[mod.key as keyof typeof matchSettings.mods]}
                onChange={(e) => setMatchSettings({ mods: { ...matchSettings.mods, [mod.key]: e.target.checked } })}
              />
              <div className="mod-info">
                <span className="mod-name">{t(mod.name)}</span>
                <span className="mod-desc">{t(mod.desc)}</span>
              </div>
            </label>
          </div>
        ))}
        <div className="mod-row">
          <label className="mod-toggle">
            <input
              type="checkbox"
              checked={slowDevice}
              onChange={(e) => setSlowDevice(e.target.checked)}
              data-testid="slow-device-toggle"
            />
            <div className="mod-info">
              <span className="mod-name">{t('slow_device')}</span>
              <span className="mod-desc">{t('slow_device_desc')}</span>
            </div>
          </label>
        </div>
        <button className="btn-base mods-close-btn" onClick={onClose}>
          {t('mods_close')}
        </button>
      </div>
    </div>
  );
}
