/**
 * Local-device kill switch for worker offload. NOT a match mod — each device
 * decides independently. URL `?worker=off` sets it; localStorage persists it.
 *
 * Default ON. Set to OFF to fall back to the main-thread render path.
 */

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';

const STORAGE_KEY = 'carrotroyale_worker';

function readInitial(): boolean {
  // URL param wins on first load.
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('worker');
      if (v === 'off') return false;
      if (v === 'on') return true;
    } catch {
      // location may throw in sandbox; fall through to storage
    }
  }
  const stored = safeStorage.get(STORAGE_KEY);
  if (stored === 'off') return false;
  return true;
}

const emitter = createEmitter<boolean>(readInitial());

export const isWorkerEnabled = emitter.get;
export const subscribeWorkerFlag = emitter.subscribe;

export function setWorkerEnabled(v: boolean): void {
  if (v === emitter.get()) return;
  emitter.set(v);
  safeStorage.set(STORAGE_KEY, v ? 'on' : 'off');
}
