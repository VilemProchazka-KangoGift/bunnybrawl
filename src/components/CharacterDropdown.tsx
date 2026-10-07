import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCharacterDisplayName } from '../engine/characters';
import { CharacterPortrait } from './CharacterPortrait';
export function CharacterDropdown({ value, onChange, characters, taken, disabled = false }: {
  value: string; onChange: (name: string) => void; characters: readonly { name: string }[]; taken: Set<string>; disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return <div className="ui-character-dropdown" ref={root} onKeyDown={e => {
    e.stopPropagation();
    if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); setOpen(true);
      if (!open) { requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.ui-character-options button:not(:disabled)')?.focus()); return; }
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('.ui-character-options button:not(:disabled)') ?? [])];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="btn-base online-char-select" data-character={value} disabled={disabled} aria-label={t('your_character')} aria-expanded={open && !disabled} aria-haspopup="true" onClick={() => setOpen(!open)}>
      <CharacterPortrait name={value} /><span>{getCharacterDisplayName(value, i18n.language)}</span><span className="dropdown-arrow">▾</span>
    </button>
    {open && !disabled && <div className="ui-character-options" role="group" aria-label={t('your_character')}>
      {characters.map(c => <button key={c.name} type="button" disabled={taken.has(c.name)} aria-pressed={value === c.name} onClick={() => { onChange(c.name); setOpen(false); trigger.current?.focus(); }}>
        <CharacterPortrait name={c.name} /><span>{getCharacterDisplayName(c.name, i18n.language)}{taken.has(c.name) ? ` (${t('taken')})` : ''}</span>
      </button>)}
    </div>}
  </div>;
}
