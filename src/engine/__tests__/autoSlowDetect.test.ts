import { describe, it, expect, afterEach } from 'vitest';
import * as autoSlowDetect from '../autoSlowDetect';
import { getAutoSlowDevice, getSlowDevice, getSlowDeviceUserPref, setSlowDevice, setAutoSlowDevice } from '../perfFlags';

afterEach(() => {
  autoSlowDetect.stop();
  setSlowDevice(false);
  setAutoSlowDevice(false);
});

describe('autoSlowDetect', () => {
  it('does not flip on healthy 60Hz frame budget', () => {
    autoSlowDetect.start();
    // Simulate 6 seconds at 16.67ms — well under threshold.
    for (let i = 0; i < 360; i++) autoSlowDetect.feedFrame(16.67);
    expect(getAutoSlowDevice()).toBe(false);
    expect(autoSlowDetect.isFlipped()).toBe(false);
  });

  it('flips when sustained low frame rate is sampled (>25ms avg)', () => {
    autoSlowDetect.start();
    // Warmup + sustained 30fps (33ms/frame) for 4 seconds total.
    for (let i = 0; i < 240; i++) autoSlowDetect.feedFrame(33);
    expect(autoSlowDetect.isFlipped()).toBe(true);
    expect(getAutoSlowDevice()).toBe(true);
    expect(getSlowDevice()).toBe(true);
  });

  it('clears the auto flag on stop()', () => {
    autoSlowDetect.start();
    for (let i = 0; i < 240; i++) autoSlowDetect.feedFrame(33);
    expect(getAutoSlowDevice()).toBe(true);
    autoSlowDetect.stop();
    expect(getAutoSlowDevice()).toBe(false);
    expect(getSlowDevice()).toBe(false);
  });

  it('stays flipped within a single match (no debounce off mid-match)', () => {
    autoSlowDetect.start();
    for (let i = 0; i < 240; i++) autoSlowDetect.feedFrame(33);
    expect(autoSlowDetect.isFlipped()).toBe(true);
    // Now feed 6 seconds of healthy frames — flag should NOT clear.
    for (let i = 0; i < 360; i++) autoSlowDetect.feedFrame(16.67);
    expect(autoSlowDetect.isFlipped()).toBe(true);
    expect(getAutoSlowDevice()).toBe(true);
  });

  it('user pref is preserved across auto flips', () => {
    setSlowDevice(true);
    expect(getSlowDeviceUserPref()).toBe(true);
    autoSlowDetect.start();
    for (let i = 0; i < 240; i++) autoSlowDetect.feedFrame(33);
    autoSlowDetect.stop();
    // stop() clears auto, but user pref persists.
    expect(getSlowDeviceUserPref()).toBe(true);
    expect(getSlowDevice()).toBe(true);
  });

  it('ignores frames during the warmup window', () => {
    autoSlowDetect.start();
    // Even a hugely slow first second shouldn't flip.
    for (let i = 0; i < 30; i++) autoSlowDetect.feedFrame(100);
    expect(autoSlowDetect.isFlipped()).toBe(false);
  });
});
