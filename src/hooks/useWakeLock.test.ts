import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

describe('useWakeLock', () => {
  // Track Trystero-style: each request returns a fresh sentinel mock so
  // tests can assert release() per instance without test-order coupling.
  const releaseMock = vi.fn(async () => {});
  let pendingResolve: ((wl: { release: typeof releaseMock }) => void) | null = null;
  let pendingReject: ((err: unknown) => void) | null = null;
  const requestMock = vi.fn(() => new Promise<{ release: typeof releaseMock }>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
  }));

  beforeEach(() => {
    releaseMock.mockClear();
    requestMock.mockClear();
    pendingResolve = null;
    pendingReject = null;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      writable: true,
      value: { request: requestMock },
    });
  });

  afterEach(() => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  });

  it('does nothing when active is false', () => {
    renderHook(() => useWakeLock(false));
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('requests a wake lock when active becomes true', () => {
    renderHook(() => useWakeLock(true));
    expect(requestMock).toHaveBeenCalledWith('screen');
  });

  it('releases the held sentinel on unmount (request resolved before unmount)', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    await act(async () => {
      pendingResolve!({ release: releaseMock });
    });
    expect(releaseMock).not.toHaveBeenCalled();
    unmount();
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('releases a late-resolving sentinel when unmount happens before request resolves', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    expect(requestMock).toHaveBeenCalled();
    // Unmount BEFORE the wake-lock promise resolves
    unmount();
    // Now the request resolves — the late sentinel must still be released.
    await act(async () => {
      pendingResolve!({ release: releaseMock });
      await Promise.resolve();
    });
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('handles a rejected wakeLock.request without throwing', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    await act(async () => {
      pendingReject!(new Error('NotAllowedError'));
      await Promise.resolve();
    });
    expect(() => unmount()).not.toThrow();
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('does nothing when navigator.wakeLock is missing', () => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    const { unmount } = renderHook(() => useWakeLock(true));
    expect(() => unmount()).not.toThrow();
  });

  it('flipping active true → false releases the sentinel', async () => {
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });
    await act(async () => {
      pendingResolve!({ release: releaseMock });
    });
    rerender({ active: false });
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('flipping active false → true → false issues a fresh request and releases its sentinel', async () => {
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: false },
    });
    expect(requestMock).not.toHaveBeenCalled();
    rerender({ active: true });
    expect(requestMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pendingResolve!({ release: releaseMock });
    });
    rerender({ active: false });
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('re-requests the wake lock on visibilitychange when sentinel was released', async () => {
    // Browsers auto-release wake locks when the tab is hidden. After the user
    // returns, the lock must be re-acquired — without this, mid-match suspends
    // result in a screen that turns off again.
    const { unmount } = renderHook(() => useWakeLock(true));
    expect(requestMock).toHaveBeenCalledTimes(1);
    // Simulate the browser releasing the lock + the page becoming visible.
    // The hook attaches a visibilitychange listener that re-requests when
    // visible & no sentinel held.
    let releaseHandler: (() => void) | null = null;
    const fakeWl = {
      release: releaseMock,
      addEventListener: (evt: string, h: () => void) => {
        if (evt === 'release') releaseHandler = h;
      },
    };
    await act(async () => {
      pendingResolve!(fakeWl as unknown as { release: typeof releaseMock });
    });
    // Browser releases lock (e.g. tab hidden).
    releaseHandler?.();
    // Page becomes visible again.
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(requestMock).toHaveBeenCalledTimes(2);
    unmount();
  });
});
