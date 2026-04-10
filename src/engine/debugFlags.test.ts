import { describe, it, expect, beforeEach } from 'vitest';
import { debugFlags, toggleNavDebug, toggleNetDebug } from './debugFlags';

describe('debugFlags', () => {
  beforeEach(() => {
    // Reset flags to default (no debug param in test URL)
    debugFlags.navDebugAllowed = false;
    debugFlags.navDebugEnabled = false;
    debugFlags.netDebugAllowed = false;
    debugFlags.netDebugEnabled = false;
  });

  describe('toggleNavDebug', () => {
    it('toggles navDebugEnabled when navDebugAllowed is true', () => {
      debugFlags.navDebugAllowed = true;
      expect(debugFlags.navDebugEnabled).toBe(false);
      toggleNavDebug();
      expect(debugFlags.navDebugEnabled).toBe(true);
      toggleNavDebug();
      expect(debugFlags.navDebugEnabled).toBe(false);
    });

    it('does nothing when navDebugAllowed is false', () => {
      debugFlags.navDebugAllowed = false;
      toggleNavDebug();
      expect(debugFlags.navDebugEnabled).toBe(false);
    });
  });

  describe('toggleNetDebug', () => {
    it('toggles netDebugEnabled when netDebugAllowed is true', () => {
      debugFlags.netDebugAllowed = true;
      expect(debugFlags.netDebugEnabled).toBe(false);
      toggleNetDebug();
      expect(debugFlags.netDebugEnabled).toBe(true);
      toggleNetDebug();
      expect(debugFlags.netDebugEnabled).toBe(false);
    });

    it('does nothing when netDebugAllowed is false', () => {
      debugFlags.netDebugAllowed = false;
      toggleNetDebug();
      expect(debugFlags.netDebugEnabled).toBe(false);
    });
  });

  describe('flags are independent', () => {
    it('toggling nav does not affect net', () => {
      debugFlags.navDebugAllowed = true;
      debugFlags.netDebugAllowed = true;
      toggleNavDebug();
      expect(debugFlags.navDebugEnabled).toBe(true);
      expect(debugFlags.netDebugEnabled).toBe(false);
    });

    it('toggling net does not affect nav', () => {
      debugFlags.navDebugAllowed = true;
      debugFlags.netDebugAllowed = true;
      toggleNetDebug();
      expect(debugFlags.netDebugEnabled).toBe(true);
      expect(debugFlags.navDebugEnabled).toBe(false);
    });
  });
});
