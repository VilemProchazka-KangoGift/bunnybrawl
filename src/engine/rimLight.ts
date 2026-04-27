import { safeStorage } from '../storage';
import { createEmitter } from './emitter';

const STORAGE_KEY = 'carrotroyale_rim_light';

const stored = safeStorage.get(STORAGE_KEY);
const enabled = createEmitter<boolean>(stored === '1');

export const getRimLight = enabled.get;
export const subscribeRimLight = enabled.subscribe;

export function setRimLight(v: boolean): void {
  if (v === enabled.get()) return;
  safeStorage.set(STORAGE_KEY, v ? '1' : '0');
  enabled.set(v);
}

/** Parse `?rim=on|off` from URL. Call once at app start. */
export function initRimLight(searchString: string): void {
  const params = new URLSearchParams(searchString);
  const param = params.get('rim');
  if (param === 'on') setRimLight(true);
  else if (param === 'off') setRimLight(false);
}

/** Install a global R-key hotkey to toggle rim light. Idempotent. */
let _hotkeyInstalled = false;
export function installRimLightHotkey(): void {
  if (_hotkeyInstalled) return;
  _hotkeyInstalled = true;
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'r' || e.key === 'R') {
      const next = !enabled.get();
      setRimLight(next);
      console.info(`[rim] ${next ? 'on' : 'off'}`);
    }
  });
}
