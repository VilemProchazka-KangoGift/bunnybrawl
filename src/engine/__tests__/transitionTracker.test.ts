import { describe, it, expect, vi } from 'vitest';
import { TransitionTracker } from '../transitionTracker';

interface Source { state: string; v: number }

describe('TransitionTracker', () => {
  it('first detect call does NOT fire onTransition (no prev baseline yet)', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    const cb = vi.fn();
    tracker.detect('p1', { state: 'idle', v: 0 }, cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('second detect call fires onTransition with the prev snapshot', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    const cb = vi.fn();
    tracker.detect('p1', { state: 'idle', v: 0 }, cb);
    tracker.detect('p1', { state: 'run', v: 100 }, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ state: 'idle', v: 0 });
  });

  it('onTransition fires every tick after first, regardless of equality', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    const cb = vi.fn();
    tracker.detect('p1', { state: 'idle', v: 0 }, cb);
    tracker.detect('p1', { state: 'idle', v: 0 }, cb);
    tracker.detect('p1', { state: 'idle', v: 0 }, cb);
    // Three calls: first primes, two more fire the callback
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('detect snapshots a copy — mutating source does not corrupt stored prev', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    const src: Source = { state: 'idle', v: 0 };
    tracker.detect('p1', src, () => {});
    src.state = 'run';
    src.v = 99;
    let captured: Source | undefined;
    tracker.detect('p1', src, (prev) => { captured = prev; });
    expect(captured).toEqual({ state: 'idle', v: 0 });
  });

  it('prev advances tick over tick — callback receives the latest snapshot', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    let captured: Source | undefined;
    const cb = (prev: Source) => { captured = prev; };

    tracker.detect('p1', { state: 'a', v: 1 }, cb);
    tracker.detect('p1', { state: 'b', v: 2 }, cb);
    expect(captured).toEqual({ state: 'a', v: 1 });

    tracker.detect('p1', { state: 'c', v: 3 }, cb);
    expect(captured).toEqual({ state: 'b', v: 2 });

    tracker.detect('p1', { state: 'd', v: 4 }, cb);
    expect(captured).toEqual({ state: 'c', v: 3 });
  });

  it('keys are isolated — different keys carry independent baselines', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    const cb = vi.fn();
    tracker.detect('p1', { state: 'idle', v: 0 }, cb);
    tracker.detect('p2', { state: 'run', v: 100 }, cb);
    expect(cb).not.toHaveBeenCalled();

    tracker.detect('p1', { state: 'run', v: 50 }, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith({ state: 'idle', v: 0 });

    tracker.detect('p2', { state: 'idle', v: 200 }, cb);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith({ state: 'run', v: 100 });
  });

  it('prime() seeds baseline without firing onTransition', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    const cb = vi.fn();
    tracker.prime('p1', { state: 'idle', v: 0 });
    tracker.detect('p1', { state: 'run', v: 50 }, cb);
    // Now detect already has a prev from prime, so it fires
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ state: 'idle', v: 0 });
  });

  it('clear() drops all baselines so the next detect is a fresh prime', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    const cb = vi.fn();
    tracker.prime('p1', { state: 'idle', v: 0 });
    tracker.prime('p2', { state: 'idle', v: 0 });
    tracker.clear();
    tracker.detect('p1', { state: 'run', v: 50 }, cb);
    tracker.detect('p2', { state: 'run', v: 50 }, cb);
    // Both baselines cleared — neither call fires the transition
    expect(cb).not.toHaveBeenCalled();
  });

  it('delete(k) drops a single key without affecting others', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    const cb = vi.fn();
    tracker.prime('p1', { state: 'idle', v: 0 });
    tracker.prime('p2', { state: 'idle', v: 0 });
    tracker.delete('p1');
    tracker.detect('p1', { state: 'run', v: 50 }, cb);
    expect(cb).not.toHaveBeenCalled();
    tracker.detect('p2', { state: 'run', v: 50 }, cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('has() and get() reflect current baseline', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    expect(tracker.has('p1')).toBe(false);
    expect(tracker.get('p1')).toBeUndefined();
    tracker.prime('p1', { state: 'idle', v: 0 });
    expect(tracker.has('p1')).toBe(true);
    expect(tracker.get('p1')).toEqual({ state: 'idle', v: 0 });
  });

  it('keys() iterates all stored keys (for swap-removal cleanup)', () => {
    const tracker = new TransitionTracker<string, Source, Source>(s => ({ ...s }));
    tracker.prime('p1', { state: 'idle', v: 0 });
    tracker.prime('p2', { state: 'idle', v: 0 });
    tracker.prime('p3', { state: 'idle', v: 0 });
    const keys = [...tracker.keys()].sort();
    expect(keys).toEqual(['p1', 'p2', 'p3']);
  });

  it('is generic over key type — supports object identity keys', () => {
    interface Spring { id: number }
    const tracker = new TransitionTracker<Spring, number, Spring>(s => s.id * 10);
    const a: Spring = { id: 1 };
    const b: Spring = { id: 2 };
    const cb = vi.fn();
    tracker.detect(a, a, cb);
    tracker.detect(b, b, cb);
    expect(cb).not.toHaveBeenCalled();

    tracker.detect(a, a, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(10);
  });

  it('fires onTransition with prev=undefined when T includes undefined as a valid value', () => {
    // Regression: detect() must use Map.has() to check for prev existence,
    // NOT `prev !== undefined` — otherwise callbacks never fire for snapshot
    // types that legitimately produce undefined.
    const tracker = new TransitionTracker<string, number, number | undefined>(
      (n) => (n === 0 ? undefined : n),
    );
    const cb = vi.fn();
    // Prime with a source that snapshots to undefined.
    tracker.detect('p1', 0, cb);
    expect(cb).not.toHaveBeenCalled();
    // Second tick: prev exists (it is undefined), so callback MUST fire.
    tracker.detect('p1', 5, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(undefined);
  });

  it('snapshot fn can transform the source into a different shape', () => {
    interface Big { id: string; state: string; vy: number; ignored: number[] }
    interface Small { state: string; vy: number }
    const tracker = new TransitionTracker<string, Small, Big>(
      (b) => ({ state: b.state, vy: b.vy }),
    );
    let captured: Small | undefined;
    tracker.detect('p1', { id: 'p1', state: 'idle', vy: 0, ignored: [1, 2, 3] }, (p) => { captured = p; });
    tracker.detect('p1', { id: 'p1', state: 'airborne', vy: -560, ignored: [4, 5] }, (p) => { captured = p; });
    expect(captured).toEqual({ state: 'idle', vy: 0 });
  });
});
