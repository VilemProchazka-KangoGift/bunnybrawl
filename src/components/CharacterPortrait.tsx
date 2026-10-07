import { getCharacterEmoji } from '../engine/characters';
import { portraitUrl } from '../uiTheme';
export function CharacterPortrait({ name, className = '' }: { name: string; className?: string }) {
  return <img className={`ui-portrait ${className}`} src={portraitUrl(name)} alt="" aria-hidden="true"
    onLoad={e => { e.currentTarget.hidden = false; e.currentTarget.parentElement?.removeAttribute('data-character-fallback'); }}
    onError={e => { e.currentTarget.hidden = true; e.currentTarget.parentElement?.setAttribute('data-character-fallback', getCharacterEmoji(name)); }} />;
}
