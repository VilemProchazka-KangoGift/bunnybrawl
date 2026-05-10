/**
 * Worker-only stub for `engine/touchDetect`. The real one reads
 * `window.matchMedia('(pointer: coarse)')` which doesn't exist in workers.
 *
 * In the sim-in-worker path, mobile touch input is detected on main and
 * forwarded over the wire (just like keyboard inputs). The worker itself
 * doesn't care whether the local user is on a touchscreen.
 */
export function isTouchPrimary(): boolean { return false; }
