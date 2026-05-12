/**
 * Auto-detect symptomatic frame-time pressure during a match and flip the
 * transient slow-device flag. Cleared on match boundaries — never persisted.
 *
 * Hysteresis: once flipped on, stays on until stop() is called. A brief
 * GC pause shouldn't bounce render scale + cosmetic gating mid-match.
 */

import { setAutoSlowDevice, getAutoSlowDevice } from './perfFlags';

const WINDOW_MS = 3000;
const WARMUP_MS = 1500;
const FRAME_BUDGET_MS = 16.67;
const HIGH_BUDGET_MS = FRAME_BUDGET_MS * 1.5;
const LONG_TASK_TRIGGER_MS = 250;

let _running = false;
let _elapsedMs = 0;
let _windowAccumMs = 0;
let _windowFrames = 0;
let _longTaskObs: PerformanceObserver | null = null;

function disconnectObserver(): void {
  if (!_longTaskObs) return;
  try { _longTaskObs.disconnect(); } catch { /* observer already gone */ }
  _longTaskObs = null;
}

function flip(): void {
  if (getAutoSlowDevice()) return;
  setAutoSlowDevice(true);
  // Further longtask events are ignored once flipped — disconnect to stop
  // the callback from firing for the rest of the match.
  disconnectObserver();
  if (typeof console !== 'undefined' && console.log) {
    console.log('[perf] auto-slow-device enabled — sustained low frame rate detected');
  }
}

/** Feed one frame's wall-clock dt (ms). Call from the RAF loop. */
export function feedFrame(dtMs: number): void {
  if (!_running || getAutoSlowDevice()) return;
  if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 1000) return;

  _elapsedMs += dtMs;
  if (_elapsedMs < WARMUP_MS) return;

  _windowFrames++;
  _windowAccumMs += dtMs;

  if (_windowAccumMs >= WINDOW_MS) {
    const avgMs = _windowAccumMs / _windowFrames;
    if (avgMs > HIGH_BUDGET_MS) {
      flip();
      return;
    }
    _windowAccumMs = 0;
    _windowFrames = 0;
  }
}

/** Begin sampling. Resets window state. Idempotent. */
export function start(): void {
  if (_running) return;
  _running = true;
  _elapsedMs = 0;
  _windowAccumMs = 0;
  _windowFrames = 0;

  if (typeof PerformanceObserver !== 'undefined') {
    try {
      _longTaskObs = new PerformanceObserver((list) => {
        // Match feedFrame's warmup — initial JS-bundle parse on a cold load
        // routinely produces a >250ms longtask (1.3MB main chunk). Without this
        // gate, every first-match session permanently flips into slow-device
        // mode and disables wildlife, dandelions, vines, snails, etc.
        if (_elapsedMs < WARMUP_MS) return;
        for (const entry of list.getEntries()) {
          if (entry.duration >= LONG_TASK_TRIGGER_MS) {
            flip();
            return;
          }
        }
      });
      _longTaskObs.observe({ entryTypes: ['longtask'] });
    } catch { /* longtask not supported */ }
  }
}

/** End sampling and clear the auto flag. Called on match-end / GameLoop.stop. */
export function stop(): void {
  if (!_running) return;
  _running = false;
  setAutoSlowDevice(false);
  disconnectObserver();
}

export function isFlipped(): boolean { return getAutoSlowDevice(); }
export function isRunning(): boolean { return _running; }
