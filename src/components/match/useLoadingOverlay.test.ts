import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoadingOverlay, loadingSubKey } from './useLoadingOverlay';

describe('useLoadingOverlay', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts with phaseIsLoading=true, localTasksDone=false, showLoadingOverlay=true', () => {
    const { result } = renderHook(() => useLoadingOverlay());
    expect(result.current.phaseIsLoading).toBe(true);
    expect(result.current.localTasksDone).toBe(false);
    expect(result.current.showLoadingOverlay).toBe(true);
    expect(result.current.showLoadingCancel).toBe(false);
  });

  it('hides overlay only when BOTH phaseIsLoading=false AND localTasksDone=true', () => {
    const { result } = renderHook(() => useLoadingOverlay());

    // Local tasks done but phase still loading → overlay still up
    act(() => result.current.setLocalTasksDone(true));
    expect(result.current.showLoadingOverlay).toBe(true);

    // Phase flips to not-loading → overlay hides
    act(() => result.current.setPhaseIsLoading(false));
    expect(result.current.showLoadingOverlay).toBe(false);
  });

  it('hides overlay if phase clears first then local tasks done', () => {
    const { result } = renderHook(() => useLoadingOverlay());
    act(() => result.current.setPhaseIsLoading(false));
    expect(result.current.showLoadingOverlay).toBe(true); // tasks not done yet
    act(() => result.current.setLocalTasksDone(true));
    expect(result.current.showLoadingOverlay).toBe(false);
  });

  it('showLoadingCancel becomes true after 3000ms of continuous overlay', () => {
    const { result } = renderHook(() => useLoadingOverlay());
    expect(result.current.showLoadingCancel).toBe(false);
    act(() => { vi.advanceTimersByTime(2999); });
    expect(result.current.showLoadingCancel).toBe(false);
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current.showLoadingCancel).toBe(true);
  });

  it('showLoadingCancel resets when overlay hides', () => {
    const { result } = renderHook(() => useLoadingOverlay());
    act(() => { vi.advanceTimersByTime(3001); });
    expect(result.current.showLoadingCancel).toBe(true);
    act(() => {
      result.current.setPhaseIsLoading(false);
      result.current.setLocalTasksDone(true);
    });
    expect(result.current.showLoadingOverlay).toBe(false);
    expect(result.current.showLoadingCancel).toBe(false);
  });

  it('re-shows overlay when phaseIsLoading flips back to true (rematch / arena change)', () => {
    const { result } = renderHook(() => useLoadingOverlay());
    act(() => {
      result.current.setPhaseIsLoading(false);
      result.current.setLocalTasksDone(true);
    });
    expect(result.current.showLoadingOverlay).toBe(false);
    // Simulate arena change: caller resets both back
    act(() => {
      result.current.setPhaseIsLoading(true);
      result.current.setLocalTasksDone(false);
    });
    expect(result.current.showLoadingOverlay).toBe(true);
  });
});

describe('loadingSubKey', () => {
  it('online + local done + phase still loading → waiting_others', () => {
    expect(loadingSubKey(true, true, true)).toBe('loading_waiting_others');
  });
  it('online + local done + phase done → loading_arena (overlay would hide but defensively safe)', () => {
    expect(loadingSubKey(true, true, false)).toBe('loading_arena');
  });
  it('online + local NOT done → loading_arena (we are still preloading)', () => {
    expect(loadingSubKey(true, false, true)).toBe('loading_arena');
  });
  it('local mode → loading_arena regardless', () => {
    expect(loadingSubKey(false, true, true)).toBe('loading_arena');
    expect(loadingSubKey(false, false, true)).toBe('loading_arena');
  });
});
