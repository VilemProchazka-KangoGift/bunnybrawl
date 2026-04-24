/**
 * Local-device performance preferences. NOT a match mod — each device has its
 * own setting, never synced to peers. Guests in online play do not see the
 * host's choice and vice versa.
 */

const STORAGE_KEY = 'carrotroyale_slow_device';

function loadSlow(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

let _slow = loadSlow();
const listeners = new Set<(v: boolean) => void>();

export function getSlowDevice(): boolean {
  return _slow;
}

export function setSlowDevice(v: boolean): void {
  if (v === _slow) return;
  _slow = v;
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* restricted context */ }
  for (const cb of listeners) cb(v);
}

export function subscribeSlowDevice(cb: (v: boolean) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
