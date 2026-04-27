/**
 * Local-device performance preferences. NOT a match mod — each device has its
 * own setting, never synced to peers. Guests in online play do not see the
 * host's choice and vice versa.
 */

import { safeStorage } from '../storage';
import { createEmitter } from './emitter';

const STORAGE_KEY = 'carrotroyale_slow_device';

const slow = createEmitter<boolean>(safeStorage.get(STORAGE_KEY) === '1');

export const getSlowDevice = slow.get;
export const subscribeSlowDevice = slow.subscribe;

export function setSlowDevice(v: boolean): void {
  if (v === slow.get()) return;
  safeStorage.set(STORAGE_KEY, v ? '1' : '0');
  slow.set(v);
}
