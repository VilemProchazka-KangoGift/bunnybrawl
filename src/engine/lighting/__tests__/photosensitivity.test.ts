import { describe, it, expect, beforeEach } from 'vitest';
import {
  initPhotosensitivity,
  getPhotosensitivity,
  setPhotosensitivity,
  subscribePhotosensitivity,
} from '../photosensitivity';

describe('photosensitivity emitter', () => {
  beforeEach(() => { initPhotosensitivity(''); });

  it('default is false', () => {
    expect(getPhotosensitivity()).toBe(false);
  });

  it('URL ?photosensitivity=on sets true', () => {
    initPhotosensitivity('?photosensitivity=on');
    expect(getPhotosensitivity()).toBe(true);
  });

  it('URL ?photosensitivity=off sets false', () => {
    initPhotosensitivity('?photosensitivity=off');
    expect(getPhotosensitivity()).toBe(false);
  });

  it('subscribers fire on change', () => {
    let calls = 0;
    const unsub = subscribePhotosensitivity(() => { calls++; });
    setPhotosensitivity(true);
    setPhotosensitivity(true); // no-op
    setPhotosensitivity(false);
    expect(calls).toBe(2);
    unsub();
  });
});
