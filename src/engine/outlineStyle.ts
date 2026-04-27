import { safeStorage } from '../storage';
import { createEmitter } from './emitter';

export type OutlineStyle = 'none' | 'black' | 'charDark' | 'adaptive';

export const OUTLINE_STYLES: readonly OutlineStyle[] = ['none', 'black', 'charDark', 'adaptive'];

const STORAGE_KEY = 'carrotroyale_outline_style';

function isValid(s: string | null): s is OutlineStyle {
  return s !== null && (OUTLINE_STYLES as readonly string[]).includes(s);
}

const stored = safeStorage.get(STORAGE_KEY);
const initial: OutlineStyle = isValid(stored) ? stored : 'none';

const style = createEmitter<OutlineStyle>(initial);

export const getOutlineStyle = style.get;
export const subscribeOutlineStyle = style.subscribe;

export function setOutlineStyle(s: OutlineStyle): void {
  if (s === style.get()) return;
  safeStorage.set(STORAGE_KEY, s);
  style.set(s);
}

/** Parse `?outline=<style>` from URL and apply if valid. Call once at app start. */
export function initOutlineStyle(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const param = params.get('outline');
  if (isValid(param)) setOutlineStyle(param);
}

export function cycleOutlineStyle(): OutlineStyle {
  const i = OUTLINE_STYLES.indexOf(style.get());
  const next = OUTLINE_STYLES[(i + 1) % OUTLINE_STYLES.length];
  setOutlineStyle(next);
  return next;
}
