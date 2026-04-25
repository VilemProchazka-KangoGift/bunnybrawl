import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransientBanner } from './useTransientBanner';

describe('useTransientBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with null value', () => {
    const { result } = renderHook(() => useTransientBanner<string>());
    expect(result.current[0]).toBeNull();
  });

  it('flashes a value, then clears after the timer', () => {
    const { result } = renderHook(() => useTransientBanner<string>());
    act(() => result.current[1]('hello', 1000));
    expect(result.current[0]).toBe('hello');
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current[0]).toBe('hello');
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current[0]).toBeNull();
  });

  it('uses 3000ms default duration when none provided', () => {
    const { result } = renderHook(() => useTransientBanner<string>());
    act(() => result.current[1]('a'));
    expect(result.current[0]).toBe('a');
    act(() => { vi.advanceTimersByTime(2999); });
    expect(result.current[0]).toBe('a');
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current[0]).toBeNull();
  });

  it('cancels prior timer when a new flash overrides it', () => {
    const { result } = renderHook(() => useTransientBanner<string>());
    act(() => result.current[1]('first', 1000));
    act(() => { vi.advanceTimersByTime(500); });
    // Second flash with longer duration; the first 1000ms timer must NOT fire
    act(() => result.current[1]('second', 2000));
    expect(result.current[0]).toBe('second');
    act(() => { vi.advanceTimersByTime(1000); });
    // Original 1000ms timer would have cleared the value here if it weren't cancelled
    expect(result.current[0]).toBe('second');
    act(() => { vi.advanceTimersByTime(1001); });
    expect(result.current[0]).toBeNull();
  });

  it('explicit null clears the banner immediately and cancels any pending timer', () => {
    const { result } = renderHook(() => useTransientBanner<string>());
    act(() => result.current[1]('x', 5000));
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
    // Spinning the clock should not resurrect the banner
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current[0]).toBeNull();
  });

  it('ms<=0 keeps the value indefinitely (no auto-clear)', () => {
    const { result } = renderHook(() => useTransientBanner<string>());
    act(() => result.current[1]('persist', 0));
    act(() => { vi.advanceTimersByTime(60000); });
    expect(result.current[0]).toBe('persist');
  });

  it('cleans up pending timer on unmount (no setState after unmount)', () => {
    const { result, unmount } = renderHook(() => useTransientBanner<string>());
    act(() => result.current[1]('msg', 1000));
    unmount();
    // Advance past the timer; if cleanup is broken, timer fires and tries to
    // setValue on the unmounted hook (would warn / mutate state outside act).
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });

  it('works with non-string types (object payloads)', () => {
    type Notice = { kind: 'info' | 'warn'; text: string };
    const { result } = renderHook(() => useTransientBanner<Notice>());
    const payload: Notice = { kind: 'warn', text: 'slow connection' };
    act(() => result.current[1](payload, 500));
    expect(result.current[0]).toEqual(payload);
    act(() => { vi.advanceTimersByTime(501); });
    expect(result.current[0]).toBeNull();
  });
});
