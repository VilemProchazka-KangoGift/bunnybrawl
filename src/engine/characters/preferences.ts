// Local-device pref: which characters appear in the lobby roster.
// User can manually pick up to MAX_LOBBY_ROSTER; remaining slots are filled
// randomly from the unselected pool. Roster is cached per session so the
// random fill is stable across multiple lobby reads, and re-rolled when the
// selection changes or `regenerateLobbyRoster()` is called (e.g. lobby mount).

import type { CharacterDef } from '../types';
import { getAllCharacterDefs } from './registry';
import { shuffleInPlace } from '../themes/utils';
import { createEmitter } from '../emitter';
import { safeStorage } from '../../storage';

export const MAX_LOBBY_ROSTER = 12; // 5 humans (P1-P5) + up to 7 bots

// Default selection — pick MAX_LOBBY_ROSTER from the registered packs.
const DEFAULT_SELECTED = ['Bunny', 'Frog', 'Owl', 'Cat', 'Panda', 'Pig', 'Chick', 'Monkey', 'Tiger', 'Hedgehog'];

const LS_KEY = 'carrotroyale_selected_chars';

function loadSelected(): Set<string> {
  const raw = safeStorage.get(LS_KEY);
  if (raw === null) return new Set(DEFAULT_SELECTED);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(DEFAULT_SELECTED);
    return new Set(parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_LOBBY_ROSTER));
  } catch { return new Set(DEFAULT_SELECTED); }
}

const selectedEmitter = createEmitter<ReadonlySet<string>>(loadSelected());
let cachedRoster: readonly CharacterDef[] | null = null;

export function getSelectedCharacters(): ReadonlySet<string> {
  return selectedEmitter.get();
}

export function setSelectedCharacters(next: Set<string>): void {
  // Cap at MAX_LOBBY_ROSTER without mutating caller's set.
  const capped: ReadonlySet<string> = next.size > MAX_LOBBY_ROSTER
    ? new Set(Array.from(next).slice(0, MAX_LOBBY_ROSTER))
    : next;
  const prev = selectedEmitter.get();
  if (capped.size === prev.size && Array.from(capped).every(name => prev.has(name))) return;
  safeStorage.set(LS_KEY, JSON.stringify(Array.from(capped)));
  cachedRoster = null;
  selectedEmitter.set(capped);
}

export const subscribeSelectedCharacters = selectedEmitter.subscribe;

/** Re-roll the random fill. Call when entering the lobby for a fresh shuffle. */
export function regenerateLobbyRoster(): void {
  cachedRoster = null;
}

/** Lobby roster: user-selected characters plus random fill to reach
 *  MAX_LOBBY_ROSTER. Cached until selection changes or regenerate is called.
 *  If fewer than MAX_LOBBY_ROSTER total characters are registered, returns
 *  whatever is available (no padding beyond the registry). */
export function getLobbyRoster(): readonly CharacterDef[] {
  if (cachedRoster) return cachedRoster;
  const all = getAllCharacterDefs();
  const selected = selectedEmitter.get();
  const selectedDefs = all.filter(c => selected.has(c.name));
  const fillCount = MAX_LOBBY_ROSTER - selectedDefs.length;
  if (fillCount <= 0) {
    cachedRoster = selectedDefs.slice(0, MAX_LOBBY_ROSTER);
    return cachedRoster;
  }
  const unselected = all.filter(c => !selected.has(c.name));
  shuffleInPlace(unselected, Math.random);
  cachedRoster = [...selectedDefs, ...unselected.slice(0, fillCount)];
  return cachedRoster;
}
