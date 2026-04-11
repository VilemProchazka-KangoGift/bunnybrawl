import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('isTouchPrimary', () => {
  // The function caches its result at module scope, so we need to reset between tests
  // by re-importing the module. Use vi.resetModules() + dynamic import.

  beforeEach(() => {
    vi.resetModules();
  });

  it('returns false in happy-dom (no touch support)', async () => {
    const { isTouchPrimary } = await import('./touchDetect');
    expect(isTouchPrimary()).toBe(false);
  });

  it('result is cached (same value on second call)', async () => {
    const { isTouchPrimary } = await import('./touchDetect');
    const first = isTouchPrimary();
    const second = isTouchPrimary();
    expect(first).toBe(second);
  });

  it('returns boolean type', async () => {
    const { isTouchPrimary } = await import('./touchDetect');
    expect(typeof isTouchPrimary()).toBe('boolean');
  });
});
