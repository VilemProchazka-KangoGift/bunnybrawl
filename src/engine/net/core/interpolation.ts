/**
 * Generic snapshot interpolation engine.
 *
 * Manages a ring buffer of snapshots with adaptive delay,
 * sequence validation, and jitter compensation.
 * Game-specific interpolation is handled by the InterpolationConfig callback.
 */
import type { InterpolationConfig } from './types';

// Ceiling is 8 frames (~133ms) so chronic jitter can buffer enough to keep
// arrivals inside the lerp window instead of falling into extrapolation.
const MIN_DELAY_FRAMES = 2;
const MAX_DELAY_FRAMES = 8;
const MAX_EXTRAP_FRAMES = 4;

/** Result of getInterpolatedState — either a single snapshot or a bracket for lerp. */
export type InterpolationResult<TSnapshot> =
  | { kind: 'single'; snapshot: TSnapshot }
  | { kind: 'interpolate'; before: TSnapshot; after: TSnapshot; t: number }
  | { kind: 'extrapolate'; snapshot: TSnapshot; overshootFrames: number }
  | null;

export class SnapshotInterpolation<TSnapshot> {
  private ring: (TSnapshot | null)[];
  private ringHead = 0;
  private ringCount = 0;
  private maxBuffer = 30;

  private latestHostFrame = 0;

  // Pre-allocated result objects to avoid per-frame allocation in getRawResult()
  private readonly _singleResult = { kind: 'single' as const, snapshot: null as TSnapshot | null };
  private readonly _interpResult = { kind: 'interpolate' as const, before: null as TSnapshot | null, after: null as TSnapshot | null, t: 0 };
  private readonly _extrapResult = { kind: 'extrapolate' as const, snapshot: null as TSnapshot | null, overshootFrames: 0 };
  private lastReceivedFrame = -1;
  private interpDelayFrames = MIN_DELAY_FRAMES;
  private initialized = false;

  // Jitter tracking for adaptive delay
  private consecutiveLateCount = 0;
  private consecutiveOnTimeCount = 0;
  private readonly TIGHTEN_THRESHOLD = 120;

  // Wall-clock arrival tracking catches in-order-but-late frames that would
  // not trip the frame-gap widening logic above.
  private lastArrivalMs = 0;
  private readonly LATE_ARRIVAL_MS = 35;

  private config: InterpolationConfig<TSnapshot>;

  constructor(config: InterpolationConfig<TSnapshot>) {
    this.config = config;
    this.ring = new Array(this.maxBuffer).fill(null);
  }

  /** Push a new snapshot from the host. Discards out-of-order packets. */
  pushSnapshot(snap: TSnapshot): void {
    const frame = this.config.getFrame(snap);

    // Sequence validation: discard stale/reordered snapshots
    if (frame <= this.lastReceivedFrame) return;

    // Detect gaps (missed snapshots) AND wall-clock late arrivals to adapt
    // delay. Frame gaps catch dropped/missing snapshots; arrival timing
    // catches in-order-but-delayed snapshots (the dominant pattern under
    // jitter without packet loss).
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this.lastReceivedFrame > 0) {
      const gap = frame - this.lastReceivedFrame;
      const arrivalGapMs = this.lastArrivalMs > 0 ? nowMs - this.lastArrivalMs : 0;
      const lateByTime = arrivalGapMs > this.LATE_ARRIVAL_MS;
      if (gap > 1 || lateByTime) {
        // Frame gap counts cumulatively; pure timing-late counts as 1.
        const lateInc = gap > 1 ? gap - 1 : 1;
        this.consecutiveLateCount += lateInc;
        this.consecutiveOnTimeCount = 0;
        if (this.consecutiveLateCount > 3 && this.interpDelayFrames < MAX_DELAY_FRAMES) {
          this.interpDelayFrames++;
          this.consecutiveLateCount = 0;
        }
      } else {
        this.consecutiveLateCount = Math.max(0, this.consecutiveLateCount - 1);
        this.consecutiveOnTimeCount++;
        if (this.consecutiveOnTimeCount >= this.TIGHTEN_THRESHOLD
            && this.interpDelayFrames > MIN_DELAY_FRAMES) {
          this.interpDelayFrames--;
          this.consecutiveOnTimeCount = 0;
        }
      }
    }
    this.lastArrivalMs = nowMs;

    this.lastReceivedFrame = frame;
    this.latestHostFrame = frame;

    this.ring[this.ringHead] = snap;
    this.ringHead = (this.ringHead + 1) % this.maxBuffer;
    if (this.ringCount < this.maxBuffer) this.ringCount++;

    this.initialized = true;
  }

  /** Read ring entry by logical index (0 = oldest). */
  private ringAt(i: number): TSnapshot {
    const start = (this.ringHead - this.ringCount + this.maxBuffer) % this.maxBuffer;
    return this.ring[(start + i) % this.maxBuffer]!;
  }

  /**
   * Caller must consume the result before the next call — returns reused objects.
   */
  getRawResult(): InterpolationResult<TSnapshot> {
    if (!this.initialized || this.ringCount < 1) return null;

    if (this.ringCount < 2) {
      this._singleResult.snapshot = this.ringAt(0);
      return this._singleResult as InterpolationResult<TSnapshot> & { kind: 'single' };
    }

    const targetFrame = this.latestHostFrame - this.interpDelayFrames;

    let before: TSnapshot | null = null;
    let after: TSnapshot | null = null;

    for (let i = 0; i < this.ringCount - 1; i++) {
      const a = this.ringAt(i);
      const b = this.ringAt(i + 1);
      if (this.config.getFrame(a) <= targetFrame && this.config.getFrame(b) >= targetFrame) {
        before = a;
        after = b;
        break;
      }
    }

    if (!before && !after) {
      this._singleResult.snapshot = this.ringAt(0);
      return this._singleResult as InterpolationResult<TSnapshot> & { kind: 'single' };
    }

    if (!after) {
      const latest = this.ringAt(this.ringCount - 1);
      const overshootFrames = targetFrame - this.config.getFrame(latest);
      if (overshootFrames > 0) {
        // Freeze-cap: when overshoot exceeds MAX_EXTRAP_FRAMES, hold at the
        // cap rather than snapping back to `latest` — the snap-back was the
        // root cause of the high-latency teleport class.
        this._extrapResult.snapshot = latest;
        this._extrapResult.overshootFrames = Math.min(overshootFrames, MAX_EXTRAP_FRAMES);
        return this._extrapResult as InterpolationResult<TSnapshot> & { kind: 'extrapolate' };
      }
      this._singleResult.snapshot = latest;
      return this._singleResult as InterpolationResult<TSnapshot> & { kind: 'single' };
    }

    if (!before) {
      this._singleResult.snapshot = after;
      return this._singleResult as InterpolationResult<TSnapshot> & { kind: 'single' };
    }

    const range = this.config.getFrame(after) - this.config.getFrame(before);
    const t = range > 0
      ? Math.max(0, Math.min(1, (targetFrame - this.config.getFrame(before)) / range))
      : 0;

    this._interpResult.before = before;
    this._interpResult.after = after;
    this._interpResult.t = t;
    return this._interpResult as InterpolationResult<TSnapshot> & { kind: 'interpolate' };
  }

  /**
   * Get the interpolated snapshot using the game's interpolation config.
   * Convenience method that applies interpolation/extrapolation automatically.
   */
  getInterpolatedState(): TSnapshot | null {
    const result = this.getRawResult();
    if (!result) return null;

    switch (result.kind) {
      case 'single':
        return result.snapshot;
      case 'interpolate':
        return this.config.interpolate
          ? this.config.interpolate(result.before, result.after, result.t)
          : result.after;
      case 'extrapolate':
        // Extrapolation is game-specific — fall back to latest snapshot
        // Games can override by using getRawResult() directly
        return result.snapshot;
    }
  }

  /** Get the latest raw snapshot (no interpolation). */
  getLatestSnapshot(): TSnapshot | null {
    return this.ringCount > 0 ? this.ringAt(this.ringCount - 1) : null;
  }

  getBufferDepth(): number {
    return this.ringCount;
  }

  getDelayFrames(): number {
    return this.interpDelayFrames;
  }

  /** Drop every buffered snapshot and reset sequencing state. Call on reconnect —
   *  the old ring would otherwise reject fresh frames as out-of-order, or lerp
   *  across a giant frame gap. */
  reset(): void {
    this.ring.fill(null);
    this.ringHead = 0;
    this.ringCount = 0;
    this.latestHostFrame = 0;
    this.lastReceivedFrame = -1;
    this.consecutiveLateCount = 0;
    this.consecutiveOnTimeCount = 0;
    this.lastArrivalMs = 0;
    this.interpDelayFrames = MIN_DELAY_FRAMES;
    this.initialized = false;
  }
}
