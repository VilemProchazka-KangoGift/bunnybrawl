// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('debugFlags', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('lazy init (Node-safe)', () => {
    it('module imports cleanly in Node env (no window)', async () => {
      const mod = await import('./debugFlags');
      expect(mod.debugFlags).toBeDefined();
      expect(mod.debugFlags.navDebugAllowed).toBe(false);
      expect(mod.debugFlags.navDebugEnabled).toBe(false);
      expect(mod.debugFlags.netDebugAllowed).toBe(false);
      expect(mod.debugFlags.netDebugEnabled).toBe(false);
      expect(mod.debugFlags.fpsAllowed).toBe(false);
      expect(mod.debugFlags.fpsEnabled).toBe(false);
      expect(mod.debugFlags.perfEnabled).toBe(false);
    });

    it('initDebugFlags(searchString) parses ?debug=nav,net,perf', async () => {
      const { debugFlags, initDebugFlags } = await import('./debugFlags');
      initDebugFlags('?debug=nav,net,perf');
      expect(debugFlags.navDebugAllowed).toBe(true);
      expect(debugFlags.navDebugEnabled).toBe(true);
      expect(debugFlags.netDebugAllowed).toBe(true);
      expect(debugFlags.netDebugEnabled).toBe(true);
      expect(debugFlags.perfEnabled).toBe(true);
      expect(debugFlags.fpsAllowed).toBe(false);
      expect(debugFlags.fpsEnabled).toBe(false);
    });

    it('initDebugFlags(searchString) parses ?debug=fps', async () => {
      const { debugFlags, initDebugFlags } = await import('./debugFlags');
      initDebugFlags('?debug=fps');
      expect(debugFlags.fpsAllowed).toBe(true);
      expect(debugFlags.fpsEnabled).toBe(true);
      expect(debugFlags.navDebugAllowed).toBe(false);
      expect(debugFlags.netDebugAllowed).toBe(false);
      expect(debugFlags.perfEnabled).toBe(false);
    });

    it('initDebugFlags(emptyString) leaves all flags false', async () => {
      const { debugFlags, initDebugFlags } = await import('./debugFlags');
      initDebugFlags('');
      expect(debugFlags.navDebugAllowed).toBe(false);
      expect(debugFlags.netDebugAllowed).toBe(false);
      expect(debugFlags.fpsAllowed).toBe(false);
      expect(debugFlags.perfEnabled).toBe(false);
    });
  });

  describe('toggleNavDebug', () => {
    it('toggles navDebugEnabled when navDebugAllowed is true', async () => {
      const { debugFlags, toggleNavDebug } = await import('./debugFlags');
      debugFlags.navDebugAllowed = true;
      debugFlags.navDebugEnabled = false;
      expect(debugFlags.navDebugEnabled).toBe(false);
      toggleNavDebug();
      expect(debugFlags.navDebugEnabled).toBe(true);
      toggleNavDebug();
      expect(debugFlags.navDebugEnabled).toBe(false);
    });

    it('does nothing when navDebugAllowed is false', async () => {
      const { debugFlags, toggleNavDebug } = await import('./debugFlags');
      debugFlags.navDebugAllowed = false;
      debugFlags.navDebugEnabled = false;
      toggleNavDebug();
      expect(debugFlags.navDebugEnabled).toBe(false);
    });
  });

  describe('toggleNetDebug', () => {
    it('toggles netDebugEnabled when netDebugAllowed is true', async () => {
      const { debugFlags, toggleNetDebug } = await import('./debugFlags');
      debugFlags.netDebugAllowed = true;
      debugFlags.netDebugEnabled = false;
      expect(debugFlags.netDebugEnabled).toBe(false);
      toggleNetDebug();
      expect(debugFlags.netDebugEnabled).toBe(true);
      toggleNetDebug();
      expect(debugFlags.netDebugEnabled).toBe(false);
    });

    it('does nothing when netDebugAllowed is false', async () => {
      const { debugFlags, toggleNetDebug } = await import('./debugFlags');
      debugFlags.netDebugAllowed = false;
      debugFlags.netDebugEnabled = false;
      toggleNetDebug();
      expect(debugFlags.netDebugEnabled).toBe(false);
    });
  });

  describe('flags are independent', () => {
    it('toggling nav does not affect net', async () => {
      const { debugFlags, toggleNavDebug } = await import('./debugFlags');
      debugFlags.navDebugAllowed = true;
      debugFlags.netDebugAllowed = true;
      debugFlags.navDebugEnabled = false;
      debugFlags.netDebugEnabled = false;
      toggleNavDebug();
      expect(debugFlags.navDebugEnabled).toBe(true);
      expect(debugFlags.netDebugEnabled).toBe(false);
    });

    it('toggling net does not affect nav', async () => {
      const { debugFlags, toggleNetDebug } = await import('./debugFlags');
      debugFlags.navDebugAllowed = true;
      debugFlags.netDebugAllowed = true;
      debugFlags.navDebugEnabled = false;
      debugFlags.netDebugEnabled = false;
      toggleNetDebug();
      expect(debugFlags.netDebugEnabled).toBe(true);
      expect(debugFlags.navDebugEnabled).toBe(false);
    });
  });
});
