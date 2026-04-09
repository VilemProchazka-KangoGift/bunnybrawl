import { useTranslation } from 'react-i18next';
import { listArenaPacks, getArenaDisplayName } from '../engine/arenas';

interface ArenaGridProps {
  onSelect: (arenaId: string) => void;
  currentId?: string;
  /** CSS class prefix: generates {prefix}-btn, {prefix}-preview, {prefix}-icon, {prefix}-name */
  classPrefix: string;
  /** Class added to button when matching currentId (default: 'selected') */
  selectedClass?: string;
}

export function ArenaGrid({ onSelect, currentId, classPrefix, selectedClass = 'selected' }: ArenaGridProps) {
  const { i18n } = useTranslation();
  return <>
    {listArenaPacks().map(a => (
      <button
        key={a.id}
        className={`${classPrefix}-btn ${currentId === a.id ? selectedClass : ''}`}
        onClick={() => onSelect(a.id)}
      >
        <div className={`${classPrefix}-preview`} style={{ background: a.previewGradient }}>
          <span className={`${classPrefix}-icon`}>{a.previewIcon}</span>
        </div>
        <span className={`${classPrefix}-name`}>{getArenaDisplayName(a.id, i18n.language)}</span>
      </button>
    ))}
  </>;
}
