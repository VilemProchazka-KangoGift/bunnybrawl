/**
 * Auto-detect symptomatic frame-time pressure during a match and flip the
 * transient slow-device flag. Cleared on match boundaries — never persisted.
 *
 * Triggers when the rolling 3-second average frame budget exceeds the
 * target by more than 50% (≡ avg fps below ~45 on a 60Hz display) for
 * one full sample window. Threshold + window picked empirically from
 * the 4×CPU throttle profile in e2e/perf-online.spec.ts: that scenario
 * sustains ~22ms/frame avg and a single PerformanceObserver longtask
 * burst >700ms inside the first second.
 *
 * Hysteresis: once flipped on, stays on until stop() is called. A brief
 * GC pause shouldn't bounce render scale + cosmetic gating mid-match.
 */

import { setAutoSlowDevice } from './perfFlags';

const WINDOW_MS = 3000;
const WARMUP_MS = 1500;          // ignore first 1.5s — JIT + sprite-cache warmup
const FRAME_BUDGET_MS = 16.67;
const HIGH_BUDGET_MS = FRAME_BUDGET_MS * 1.5;  // ~25ms = ~40fps avg
const LONG_TASK_TRIGGER_MS = 250; // single longtask this big = trigger immediately

let _running = false;
let _flipped = false;
let _elapsedMs = 0;        // sum of fed dts since start — drives windowing
let _windowAccumMs = 0;    // dt accumulated in the current window
let _windowFrames = 0;
let _longTaskObs: PerformanceObserver | null = null;

function flip(): void {
  if (_flipped) return;
  _flipped = true;
  setAutoSlowDevice(true);
  // Dev visibility — CI logs and console will show one line per trigger.
  // Production users get the perf benefit silently.
  if (typeof console !== 'undefined' && console.log) {
    console.log('[perf] auto-slow-device enabled — sustained low frame rate detected');
  }
  // E2E probe: lets the perf-online suite assert the trigger fired without
  // monkey-patching internals. No production behaviour change.
  if (typeof globalThis !== 'undefined') {
    (globalThis as { __autoSlowFlipped?: boolean }).__autoSlowFlipped = true;
  }
}

/** Feed one frame's wall-clock dt (ms). Call from the RAF loop. */
export function feedFrame(dtMs: number): void {
  if (!_running || _flipped) return;
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

/** Begin sampling. Resets window state. Idempotent — calling twice is a no-op. */
export function start(): void {
  if (_running) return;
  _running = true;
  _flipped = false;
  _elapsedMs = 0;
  _windowAccumMs = 0;
  _windowFrames = 0;

  // PerformanceObserver gives us a separate signal: a single >250ms longtask
  // (V8 JIT, large GC, off-main-thread paint stall) is enough on its own.
  // Browsers without longtask support skip this — feedFrame still triggers.
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      _longTaskObs = new PerformanceObserver((list) => {
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
  _flipped = false;
  setAutoSlowDevice(false);
  if (_longTaskObs) {
    try { _longTaskObs.disconnect(); } catch { /* observer already gone */ }
    _longTaskObs = null;
  }
  if (typeof globalThis !== 'undefined') {
    (globalThis as { __autoSlowFlipped?: boolean }).__autoSlowFlipped = false;
  }
}

/** Test introspection. */
export function isFlipped(): boolean { return _flipped; }
export function isRunning(): boolean { return _running; }
