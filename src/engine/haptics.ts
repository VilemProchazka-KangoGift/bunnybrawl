import type { PlayerSlot } from './types';
import { isTouchPrimary } from './touchDetect';

/**
 * Haptic feedback via Vibration API.
 * Only vibrates for events involving the local player (touchSlot).
 * No-op on desktop or unsupported browsers.
 */
export const haptics = {
  enabled: false,
  localSlot: null as PlayerSlot | null,

  init(slot: PlayerSlot) {
    this.enabled = isTouchPrimary() && 'vibrate' in navigator;
    this.localSlot = slot;
  },

  /** Check if a player is the local touch player. */
  isLocal(slot: PlayerSlot): boolean {
    return this.enabled && slot === this.localSlot;
  },

  /** Hitstop — local player involved in kill (attacker or victim).
   *  `_slot` is ignored on main (the localSlot gate already happened
   *  upstream in `isLocal`); the worker stub uses it to thread slot
   *  into the wire payload so main can re-gate after the cross-thread
   *  hop. Optional, defaults preserved. */
  hitstop(_slot?: PlayerSlot) {
    if (this.enabled) navigator.vibrate(70);
  },

  /** Hazard damage — burn/thorn/ghost. */
  hazardHit() {
    if (this.enabled) navigator.vibrate([30, 20, 60]);
  },

  /** Spring bounce. */
  spring() {
    if (this.enabled) navigator.vibrate([20, 40, 20]);
  },

  /** Player-player push collision. */
  bump() {
    if (this.enabled) navigator.vibrate(25);
  },

  /** Landing — intensity scales with fall speed (vy at moment of impact).
   *  See `hitstop` for `_slot` semantics. */
  landing(vy: number, _slot?: PlayerSlot) {
    if (!this.enabled) return;
    // Only vibrate for significant landings (vy > 200)
    if (vy < 200) return;
    // Scale: vy 200→600 maps to 10→80ms vibration
    const ms = Math.round(Math.min(80, (vy - 200) / 400 * 70 + 10));
    navigator.vibrate(ms);
  },
};
