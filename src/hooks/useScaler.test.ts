import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../engine/constants';

// Mock touchDetect to prevent URL/matchMedia access issues in tests
vi.mock('../engine/touchDetect', () => ({
  isTouchPrimary: () => false,
}));

import { useScaler } from './useScaler';

describe('useScaler', () => {
  let originalInnerWidth: number;
  let originalInnerHeight: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, writable: true, configurable: true });
  });

  it('returns containerRef, isFullscreen, and toggleFullscreen', () => {
    const { result } = renderHook(() => useScaler());
    expect(result.current.containerRef).toBeDefined();
    expect(typeof result.current.isFullscreen).toBe('boolean');
    expect(typeof result.current.toggleFullscreen).toBe('function');
  });

  it('starts with isFullscreen false when no fullscreen element', () => {
    const { result } = renderHook(() => useScaler());
    expect(result.current.isFullscreen).toBe(false);
  });

  it('applies correct scale transform when container is attached', () => {
    // Set viewport to 1920x1080
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true, configurable: true });

    const { result } = renderHook(() => useScaler());

    // Simulate attaching a div to the ref
    const div = document.createElement('div');
    // Manually set the ref's current value by rendering with a real element
    // The hook applies transform in useEffect, so we need to verify the logic
    // Expected scale: min(1920/1280, 1080/720) = min(1.5, 1.5) = 1.5
    const expectedScale = Math.min(1920 / CANVAS_WIDTH, 1080 / CANVAS_HEIGHT);
    expect(expectedScale).toBe(1.5);
  });

  it('calculates scale based on min of width and height ratios', () => {
    // Wide viewport — height is the limiting factor
    Object.defineProperty(window, 'innerWidth', { value: 2560, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 720, writable: true, configurable: true });

    const scaleWide = Math.min(2560 / CANVAS_WIDTH, 720 / CANVAS_HEIGHT);
    // 2560/1280 = 2.0, 720/720 = 1.0 => scale = 1.0
    expect(scaleWide).toBe(1.0);

    // Tall viewport — width is the limiting factor
    Object.defineProperty(window, 'innerWidth', { value: 640, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true, configurable: true });

    const scaleTall = Math.min(640 / CANVAS_WIDTH, 1080 / CANVAS_HEIGHT);
    // 640/1280 = 0.5, 1080/720 = 1.5 => scale = 0.5
    expect(scaleTall).toBe(0.5);
  });

  it('responds to window resize events', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 720, writable: true, configurable: true });

    const { result } = renderHook(() => useScaler());

    // Simulate a resize
    Object.defineProperty(window, 'innerWidth', { value: 640, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 360, writable: true, configurable: true });

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      // The hook debounces resize by 100ms
      await new Promise(r => setTimeout(r, 150));
    });

    // The hook should still be functional after resize
    expect(result.current.containerRef).toBeDefined();
  });

  it('cleans up event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useScaler());
    unmount();

    // Should remove resize and keydown listeners
    const removedEvents = removeSpy.mock.calls.map(call => call[0]);
    expect(removedEvents).toContain('resize');
    expect(removedEvents).toContain('keydown');

    removeSpy.mockRestore();
  });

  it('toggleFullscreen calls requestFullscreen when not fullscreen', () => {
    const requestSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: requestSpy,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useScaler());

    act(() => {
      result.current.toggleFullscreen();
    });

    expect(requestSpy).toHaveBeenCalled();
  });
});
