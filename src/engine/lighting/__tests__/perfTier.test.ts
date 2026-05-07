import { describe, it, expect, beforeEach } from 'vitest';
import { initPerfTier, getPerfTier, setPerfTier, subscribePerfTier } from '../perfTier';

describe('perfTier emitter', () => {
  beforeEach(() => {
    initPerfTier('');
  });

  it('default is "med"', () => {
    expect(getPerfTier()).toBe('med');
  });

  it('URL ?perfTier=low sets low', () => {
    initPerfTier('?perfTier=low');
    expect(getPerfTier()).toBe('low');
  });

  it('URL ?perfTier=high sets high', () => {
    initPerfTier('?perfTier=high');
    expect(getPerfTier()).toBe('high');
  });

  it('invalid URL value falls back to default', () => {
    initPerfTier('?perfTier=ultra');
    expect(getPerfTier()).toBe('med');
  });

  it('setPerfTier notifies subscribers', () => {
    let calls = 0;
    const unsub = subscribePerfTier(() => { calls++; });
    setPerfTier('high');
    expect(calls).toBe(1);
    setPerfTier('high'); // no-op same value
    expect(calls).toBe(1);
    setPerfTier('low');
    expect(calls).toBe(2);
    unsub();
  });
});
