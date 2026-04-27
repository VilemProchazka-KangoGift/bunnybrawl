// Dev-only FPS counter. Sampled at the rAF level (local + network loops),
// rendered as a bottom-left overlay when ?debug=fps is set.

import { CANVAS_HEIGHT } from './constants';
import { debugFlags } from './debugFlags';

const WINDOW_MS = 5000;
const MAX_SAMPLES = 600; // 5s @ 120Hz cap; oldest evicted via circular write

const frameDts = new Float32Array(MAX_SAMPLES);
const workBuffer = new Float32Array(MAX_SAMPLES);
let writeIdx = 0;
let total = 0;
let lastSampleTime = 0;

export function sampleFps(now: number): void {
  if (!debugFlags.fpsEnabled) return;
  if (lastSampleTime === 0) { lastSampleTime = now; return; }
  const dt = now - lastSampleTime;
  lastSampleTime = now;
  // Drop dt from tab-switch / breakpoint pauses — would skew 1% low forever.
  if (dt <= 0 || dt > 1000) return;
  frameDts[writeIdx % MAX_SAMPLES] = dt;
  writeIdx++;
  if (total < MAX_SAMPLES) total++;
}

export function resetFpsCounter(): void {
  writeIdx = 0;
  total = 0;
  lastSampleTime = 0;
}

/** Dump the raw frame-time samples (newest-first) for E2E perf collection.
 *  Returns up to MAX_SAMPLES dt values in milliseconds, plus the
 *  performance.now() timestamp of the most recent sample. The timestamp lets
 *  consumers reconstruct absolute (page-time) timestamps per frame so they
 *  align with longTask / CDP timelines. */
export function dumpSamples(): { dts: number[]; count: number; lastSampleTime: number } {
  const dts: number[] = [];
  for (let i = 0; i < total; i++) {
    const idx = (writeIdx - 1 - i + MAX_SAMPLES) % MAX_SAMPLES;
    dts.push(frameDts[idx]);
  }
  return { dts, count: total, lastSampleTime };
}

interface FpsStats {
  current: number;
  avg: number;
  low1pct: number;
  lastDtMs: number;
  count: number;
}

function computeStats(): FpsStats {
  if (total === 0) return { current: 0, avg: 0, low1pct: 0, lastDtMs: 0, count: 0 };

  // Walk newest→oldest, copy into workBuffer until we've covered WINDOW_MS.
  let elapsed = 0;
  let n = 0;
  for (let i = 0; i < total; i++) {
    const idx = (writeIdx - 1 - i + MAX_SAMPLES) % MAX_SAMPLES;
    const dt = frameDts[idx];
    workBuffer[n++] = dt;
    elapsed += dt;
    if (elapsed >= WINDOW_MS) break;
  }

  const lastDt = workBuffer[0];
  const current = lastDt > 0 ? 1000 / lastDt : 0;

  let sum = 0;
  for (let i = 0; i < n; i++) sum += workBuffer[i];
  const avg = sum > 0 ? (1000 * n) / sum : 0;

  // Sort ascending (Float32Array uses fast numeric sort), take worst K from the tail.
  const slice = workBuffer.subarray(0, n);
  slice.sort();
  const lowK = Math.max(1, Math.floor(n * 0.01));
  let lowSum = 0;
  for (let i = 0; i < lowK; i++) lowSum += slice[n - 1 - i];
  const low1pct = lowSum > 0 ? (1000 * lowK) / lowSum : 0;

  return { current, avg, low1pct, lastDtMs: lastDt, count: n };
}

function colorForFps(fps: number): string {
  if (fps >= 55) return '#7FE07F';
  if (fps >= 30) return '#FFD86B';
  return '#FF6B6B';
}

// Per-character width for `bold 12px monospace`, measured once on first
// draw. Lets us replace per-frame ctx.measureText calls (3–7% of perf
// profiles when fpsCounter is on) with `text.length * _charWidth`.
let _charWidth = 0;

export function drawFpsCounter(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
  if (!debugFlags.fpsEnabled) return;
  const stats = computeStats();
  void canvasWidth; // bottom-left is fixed; param kept for symmetry with other overlays

  ctx.save();
  ctx.font = 'bold 12px monospace';
  ctx.textBaseline = 'top';

  if (_charWidth === 0) _charWidth = ctx.measureText('M').width;

  const line1 = `${stats.current.toFixed(0)} fps  ${stats.lastDtMs.toFixed(1)}ms`;
  const line2 = `avg ${stats.avg.toFixed(0)}  1%low ${stats.low1pct.toFixed(0)}`;
  const w1 = line1.length * _charWidth;
  const w2 = line2.length * _charWidth;
  const padX = 8;
  const padY = 6;
  const lineH = 14;
  const boxW = Math.max(w1, w2) + padX * 2;
  const boxH = lineH * 2 + padY * 2;
  const x = 10;
  const y = CANVAS_HEIGHT - 10 - boxH;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(x, y, boxW, boxH);

  ctx.fillStyle = colorForFps(stats.current);
  ctx.fillText(line1, x + padX, y + padY);
  ctx.fillStyle = colorForFps(stats.low1pct);
  ctx.fillText(line2, x + padX, y + padY + lineH);
  ctx.restore();
}
