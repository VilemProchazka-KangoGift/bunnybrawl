import { describe, it, expect, beforeEach } from 'vitest';
import { initBrightness, getBrightness, setBrightness, subscribeBrightness } from '../brightness';

describe('brightness emitter', () => {
  beforeEach(() => { initBrightness(''); });

  it('default is 1.0', () => {
    expect(getBrightness()).toBe(1.0);
  });

  it('URL ?brightness=0.7 sets 0.7', () => {
    initBrightness('?brightness=0.7');
    expect(getBrightness()).toBeCloseTo(0.7);
  });

  it('clamps to [0.5, 1.5]', () => {
    setBrightness(0.1);
    expect(getBrightness()).toBe(0.5);
    setBrightness(2.0);
    expect(getBrightness()).toBe(1.5);
  });

  it('NaN URL falls back to default', () => {
    initBrightness('?brightness=lol');
    expect(getBrightness()).toBe(1.0);
  });

  it('subscribers fire on change', () => {
    let calls = 0;
    const unsub = subscribeBrightness(() => { calls++; });
    setBrightness(0.8);
    setBrightness(0.8); // no-op
    setBrightness(1.2);
    expect(calls).toBe(2);
    unsub();
  });
});
