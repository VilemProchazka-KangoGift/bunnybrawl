import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDelayedFlag } from './useDelayedFlag';

describe('useDelayedFlag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when active is false', () => {
    const { result } = renderHook(() => useDelayedFlag(false, 1000));
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(false);
  });

  it('flips to true only after `ms` of continuous active=true', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 1000),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toBe(true);
    rerender({ active: true });
    expect(result.current).toBe(true);
  });

  it('resets to false the moment active becomes false', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 1000),
      { initialProps: { active: true } },
    );
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(true);
    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it('cancels pending timer if active flips false before threshold', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDelayedFlag(active, 1000),
      { initialProps: { active: true } },
    );
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(false);
    rerender({ active: false });
    // If the timer wasn't cancelled it would still fire at t=1000
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(false);
  });

  it('restarts the timer when active flips false then true', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDelayedFlag(active, 1000),
      { initialProps: { active: true } },
    );
    act(() => { vi.advanceTimersByTime(500); });
    rerender({ active: false });
    rerender({ active: true });
    // Fresh 1000ms timer; 999ms in still false
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toBe(true);
  });

  it('responds to ms changes', () => {
    const { result, rerender } = renderHook(
      ({ ms }: { ms: number }) => useDelayedFlag(true, ms),
      { initialProps: { ms: 5000 } },
    );
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(false);
    rerender({ ms: 100 });
    act(() => { vi.advanceTimersByTime(101); });
    expect(result.current).toBe(true);
  });

  it('cleans up pending timer on unmount', () => {
    const { unmount } = renderHook(() => useDelayedFlag(true, 1000));
    unmount();
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});
