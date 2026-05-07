import { describe, it, expect } from 'vitest';
import { initLightMode, getLightMode, setLightMode } from '../lightMode';

describe('lightMode emitter', () => {
  it('defaults to combined when no URL or storage value', () => {
    initLightMode('');
    expect(getLightMode()).toBe('combined');
  });

  it('reads ?lmode=combined from URL', () => {
    initLightMode('?lmode=combined');
    expect(getLightMode()).toBe('combined');
  });

  it('reads ?lmode=split from URL', () => {
    initLightMode('?lmode=split');
    expect(getLightMode()).toBe('split');
  });

  it('rejects unknown values and falls back to default', () => {
    initLightMode('?lmode=bogus');
    expect(getLightMode()).toBe('combined');
  });

  it('setLightMode round-trips through serialize/parse', () => {
    initLightMode('');
    setLightMode('split');
    expect(getLightMode()).toBe('split');
    setLightMode('combined');
    expect(getLightMode()).toBe('combined');
  });
});
