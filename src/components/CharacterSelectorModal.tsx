import { useSyncExternalStore, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getAllCharacters, getCharacterEmoji, getCharacterDisplayName,
  getSelectedCharacters, setSelectedCharacters, subscribeSelectedCharacters,
  MAX_LOBBY_ROSTER,
} from '../engine/characters';

interface CharacterSelectorModalProps {
  onClose: () => void;
}

const subscribe = (l: () => void) => subscribeSelectedCharacters(l);
const getSnapshot = () => getSelectedCharacters();

export function CharacterSelectorModal({ onClose }: CharacterSelectorModalProps) {
  const { t, i18n } = useTranslation();
  const selected = useSyncExternalStore(subscribe, getSnapshot);
  const allChars = getAllCharacters();

  const toggle = useCallback((name: string) => {
    const next = new Set(selected);
    if (next.has(name)) {
      next.delete(name);
    } else {
      if (next.size >= MAX_LOBBY_ROSTER) return;
      next.add(name);
    }
    setSelectedCharacters(next);
  }, [selected]);

  return (
    <div className="mods-overlay" onClick={onClose}>
      <div className="mods-modal char-selector-modal" onClick={e => e.stopPropagation()}>
        <h2 className="mods-title">{t('char_selector_title')}</h2>
        <p className="char-selector-hint">
          {t('char_selector_hint', { selected: selected.size, max: MAX_LOBBY_ROSTER })}
        </p>
        <div className="char-selector-grid">
          {allChars.map(c => {
            const isSelected = selected.has(c.name);
            const isFull = !isSelected && selected.size >= MAX_LOBBY_ROSTER;
            return (
              <button
                key={c.name}
                type="button"
                className={`char-selector-card${isSelected ? ' selected' : ''}${isFull ? ' disabled' : ''}`}
                onClick={() => toggle(c.name)}
                disabled={isFull}
                title={isFull ? t('char_selector_at_max') : ''}
              >
                <span className="char-selector-emoji">{getCharacterEmoji(c.name)}</span>
                <span className="char-selector-name">{getCharacterDisplayName(c.name, i18n.language)}</span>
              </button>
            );
          })}
        </div>
        <button className="btn-base mods-close-btn" onClick={onClose}>
          {t('mods_close')}
        </button>
      </div>
    </div>
  );
}
