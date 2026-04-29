/**
 * Local-device performance preferences. NOT a match mod — each device has its
 * own setting, never synced to peers. Guests in online play do not see the
 * host's choice and vice versa.
 *
 * Two layers: the user's persisted preference (Mods toggle) and a transient
 * auto-detected override flipped by the GameLoop's perf monitor when it sees
 * sustained low fps / long tasks. getSlowDevice() returns the OR — engine
 * consumers (renderer, cosmetic systems) only care about the effective state.
 * The UI checkbox reads getSlowDeviceUserPref() so the user's saved choice
 * stays visible even when auto is overlaid on top.
 */

import { safeStorage } from '../storage';
import { createEmitter } from './emitter';

const STORAGE_KEY = 'carrotroyale_slow_device';

let _userPref = safeStorage.get(STORAGE_KEY) === '1';
let _auto = false;
const effective = createEmitter<boolean>(_userPref || _auto);

function recompute(): void {
  effective.set(_userPref || _auto);
}

export const getSlowDevice = effective.get;
export const subscribeSlowDevice = effective.subscribe;

export function getSlowDeviceUserPref(): boolean { return _userPref; }

export function setSlowDevice(v: boolean): void {
  if (v === _userPref) return;
  _userPref = v;
  safeStorage.set(STORAGE_KEY, v ? '1' : '0');
  recompute();
}

/** Transient auto-detection override. Cleared on match boundaries; not
 *  persisted. Wired by the GameLoop's perf-symptom monitor. */
export function setAutoSlowDevice(v: boolean): void {
  if (v === _auto) return;
  _auto = v;
  recompute();
}

export function getAutoSlowDevice(): boolean { return _auto; }
