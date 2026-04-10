import { describe, it, expect, vi, beforeEach } from 'vitest';
import { haptics } from './haptics';

// Mock navigator.vibrate
const vibrateMock = vi.fn();
Object.defineProperty(navigator, 'vibrate', {
  value: vibrateMock,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  vibrateMock.mockClear();
  haptics.enabled = false;
  haptics.localSlot = null;
});

describe('haptics', () => {
  describe('isLocal', () => {
    it('returns false when not enabled', () => {
      haptics.localSlot = 'P1';
      expect(haptics.isLocal('P1')).toBe(false);
    });

    it('returns true when enabled and slot matches', () => {
      haptics.enabled = true;
      haptics.localSlot = 'P1';
      expect(haptics.isLocal('P1')).toBe(true);
    });

    it('returns false when enabled but slot differs', () => {
      haptics.enabled = true;
      haptics.localSlot = 'P1';
      expect(haptics.isLocal('P2')).toBe(false);
    });
  });

  describe('vibration methods', () => {
    it('hitstop vibrates when enabled', () => {
      haptics.enabled = true;
      haptics.hitstop();
      expect(vibrateMock).toHaveBeenCalledWith(70);
    });

    it('hitstop does not vibrate when disabled', () => {
      haptics.enabled = false;
      haptics.hitstop();
      expect(vibrateMock).not.toHaveBeenCalled();
    });

    it('hazardHit uses pattern', () => {
      haptics.enabled = true;
      haptics.hazardHit();
      expect(vibrateMock).toHaveBeenCalledWith([30, 20, 60]);
    });

    it('spring uses pattern', () => {
      haptics.enabled = true;
      haptics.spring();
      expect(vibrateMock).toHaveBeenCalledWith([20, 40, 20]);
    });

    it('bump vibrates briefly', () => {
      haptics.enabled = true;
      haptics.bump();
      expect(vibrateMock).toHaveBeenCalledWith(25);
    });
  });

  describe('landing', () => {
    it('does not vibrate when disabled', () => {
      haptics.enabled = false;
      haptics.landing(400);
      expect(vibrateMock).not.toHaveBeenCalled();
    });

    it('does not vibrate for gentle landing (vy < 200)', () => {
      haptics.enabled = true;
      haptics.landing(199);
      expect(vibrateMock).not.toHaveBeenCalled();
    });

    it('vibrates for significant landing (vy >= 200)', () => {
      haptics.enabled = true;
      haptics.landing(200);
      expect(vibrateMock).toHaveBeenCalled();
    });

    it('scales vibration with fall speed', () => {
      haptics.enabled = true;
      haptics.landing(200);
      const lowImpact = vibrateMock.mock.calls[0][0];
      vibrateMock.mockClear();
      haptics.landing(600);
      const highImpact = vibrateMock.mock.calls[0][0];
      expect(highImpact).toBeGreaterThan(lowImpact);
    });

    it('caps vibration at 80ms for very high fall speed', () => {
      haptics.enabled = true;
      haptics.landing(10000);
      const ms = vibrateMock.mock.calls[0][0];
      expect(ms).toBeLessThanOrEqual(80);
    });

    it('landing at vy=200 produces minimum vibration (~10ms)', () => {
      haptics.enabled = true;
      haptics.landing(200);
      const ms = vibrateMock.mock.calls[0][0];
      expect(ms).toBeCloseTo(10, 0);
    });

    it('landing at vy=600 produces maximum vibration (~80ms)', () => {
      haptics.enabled = true;
      haptics.landing(600);
      const ms = vibrateMock.mock.calls[0][0];
      expect(ms).toBeCloseTo(80, 0);
    });
  });

  describe('init', () => {
    it('sets localSlot', () => {
      // isTouchPrimary returns false in test env, so enabled stays false
      haptics.init('P2');
      expect(haptics.localSlot).toBe('P2');
    });
  });

  describe('all methods are no-op when disabled', () => {
    it('hazardHit', () => {
      haptics.enabled = false;
      haptics.hazardHit();
      expect(vibrateMock).not.toHaveBeenCalled();
    });

    it('spring', () => {
      haptics.enabled = false;
      haptics.spring();
      expect(vibrateMock).not.toHaveBeenCalled();
    });

    it('bump', () => {
      haptics.enabled = false;
      haptics.bump();
      expect(vibrateMock).not.toHaveBeenCalled();
    });
  });
});
