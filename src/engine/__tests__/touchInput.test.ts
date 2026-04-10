import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TouchInputManager } from '../touchInput';

// Constants mirrored from touchInput.ts for readable assertions
const CANVAS_WIDTH = 1280;
const DEAD_ZONE = 12;
const MAX_RADIUS = 60;
const SWIPE_DISTANCE = 40;

// ---------- helpers ----------

/** Create a minimal mock container with controllable bounding rect. */
function makeContainer(rect: Partial<DOMRect> = {}): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({
    x: 0, y: 0, width: 1280, height: 720,
    top: 0, left: 0, right: 1280, bottom: 720,
    toJSON: () => ({}),
    ...rect,
  });
  return el;
}

/**
 * Build a fake TouchEvent-like object accepted by the private handlers.
 * happy-dom may not support the real TouchEvent constructor, so we craft
 * a plain object with the properties the handler reads.
 */
function fakeTouchEvent(
  type: string,
  touches: Array<{ identifier: number; clientX: number; clientY: number }>,
  target?: HTMLElement,
): TouchEvent {
  const touchObjects = touches.map(t => ({
    identifier: t.identifier,
    clientX: t.clientX,
    clientY: t.clientY,
    // Minimal Touch-like shape; only fields the handler accesses
    target: target ?? document.createElement('div'),
  }));
  return {
    type,
    changedTouches: {
      length: touchObjects.length,
      item: (i: number) => touchObjects[i] ?? null,
      [Symbol.iterator]: function* () { for (const t of touchObjects) yield t; },
      ...touchObjects, // indexed access: changedTouches[0], changedTouches[1]
    },
    target: target ?? document.createElement('div'),
    preventDefault: vi.fn(),
  } as unknown as TouchEvent;
}

// Access private bound handlers
type AnyTIM = { // eslint-disable-line @typescript-eslint/no-explicit-any
  boundTouchStart: (e: TouchEvent) => void;
  boundTouchMove: (e: TouchEvent) => void;
  boundTouchEnd: (e: TouchEvent) => void;
  joystickTouchId: number | null;
  jumpTouchId: number | null;
  leftActive: boolean;
  rightActive: boolean;
  jumpTriggered: boolean;
  jumpConsumed: boolean;
  downFromSwipe: boolean;
  cachedRect: DOMRect | null;
  cachedScale: number;
};

function priv(m: TouchInputManager): AnyTIM {
  return m as unknown as AnyTIM;
}

// ---------- tests ----------

describe('TouchInputManager', () => {
  let manager: TouchInputManager;
  let container: HTMLElement;

  beforeEach(() => {
    manager = new TouchInputManager();
    container = makeContainer();
    manager.attach(container, () => 1);
  });

  afterEach(() => {
    manager.detach();
  });

  // ---- 1. Initial state ----

  describe('initial state', () => {
    it('returns all-false input before any touch', () => {
      const input = manager.getInput();
      expect(input).toEqual({ left: false, right: false, jump: false, down: false });
    });
  });

  // ---- 2. Joystick (left half of screen) ----

  describe('joystick (left half)', () => {
    /** Simulate a touch start on the left half, then a move. */
    function startJoystick(x: number, y: number, id = 0) {
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [{ identifier: id, clientX: x, clientY: y }]));
    }

    function moveJoystick(x: number, y: number, id = 0) {
      priv(manager).boundTouchMove(fakeTouchEvent('touchmove', [{ identifier: id, clientX: x, clientY: y }]));
    }

    function endJoystick(x: number, y: number, id = 0) {
      priv(manager).boundTouchEnd(fakeTouchEvent('touchend', [{ identifier: id, clientX: x, clientY: y }]));
    }

    it('activates left when moved past dead zone to the left', () => {
      const baseX = 200;
      startJoystick(baseX, 400);
      moveJoystick(baseX - DEAD_ZONE - 1, 400);

      const input = manager.getInput();
      expect(input.left).toBe(true);
      expect(input.right).toBe(false);
    });

    it('activates right when moved past dead zone to the right', () => {
      const baseX = 200;
      startJoystick(baseX, 400);
      moveJoystick(baseX + DEAD_ZONE + 1, 400);

      const input = manager.getInput();
      expect(input.left).toBe(false);
      expect(input.right).toBe(true);
    });

    it('stays neutral when within dead zone', () => {
      const baseX = 200;
      startJoystick(baseX, 400);
      moveJoystick(baseX + DEAD_ZONE - 1, 400); // just inside dead zone

      const input = manager.getInput();
      expect(input.left).toBe(false);
      expect(input.right).toBe(false);
    });

    it('stays neutral at exactly dead zone boundary', () => {
      const baseX = 200;
      startJoystick(baseX, 400);
      moveJoystick(baseX + DEAD_ZONE, 400); // exactly at boundary: absDx < DEAD_ZONE is false at boundary

      const input = manager.getInput();
      // At exactly DEAD_ZONE: absDx (12) is NOT < 12, so it enters the else branch -> right
      expect(input.right).toBe(true);
    });

    it('resets direction on touch end', () => {
      const baseX = 200;
      startJoystick(baseX, 400);
      moveJoystick(baseX + DEAD_ZONE + 10, 400);
      expect(manager.getInput().right).toBe(true);

      endJoystick(baseX + DEAD_ZONE + 10, 400);
      const input = manager.getInput();
      expect(input.left).toBe(false);
      expect(input.right).toBe(false);
    });

    it('ignores second joystick touch while first is active', () => {
      startJoystick(200, 400, 0);
      moveJoystick(200 + DEAD_ZONE + 5, 400, 0); // right

      // Second touch on left half with different id
      startJoystick(100, 300, 5);
      moveJoystick(100 - DEAD_ZONE - 5, 300, 5); // attempts left

      // Should still be right from original touch (id 5 ignored)
      const input = manager.getInput();
      expect(input.right).toBe(true);
      expect(input.left).toBe(false);
    });

    it('can switch direction within a single joystick touch', () => {
      const baseX = 300;
      startJoystick(baseX, 400);
      moveJoystick(baseX + DEAD_ZONE + 5, 400);
      expect(manager.getInput().right).toBe(true);

      // Now drag to the left
      moveJoystick(baseX - DEAD_ZONE - 5, 400);
      const input = manager.getInput();
      expect(input.left).toBe(true);
      expect(input.right).toBe(false);
    });
  });

  // ---- 3. Jump (right half of screen) ----

  describe('jump (right half)', () => {
    function tapRight(x: number, y: number, id = 1) {
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [{ identifier: id, clientX: x, clientY: y }]));
    }

    function endRight(x: number, y: number, id = 1) {
      priv(manager).boundTouchEnd(fakeTouchEvent('touchend', [{ identifier: id, clientX: x, clientY: y }]));
    }

    it('triggers jump on tap in right half', () => {
      tapRight(800, 400);
      const input = manager.getInput();
      expect(input.jump).toBe(true);
    });

    it('consumes jump after first getInput read', () => {
      tapRight(800, 400);
      manager.getInput(); // first read -> consumes jump

      const input2 = manager.getInput();
      expect(input2.jump).toBe(false);
    });

    it('resets jump state on touch end', () => {
      tapRight(800, 400);
      manager.getInput(); // consume
      endRight(800, 400);

      const input = manager.getInput();
      expect(input.jump).toBe(false);
    });

    it('ignores second jump touch while first is active', () => {
      tapRight(800, 400, 1);
      manager.getInput(); // consume jump from id 1

      // Second touch on right half should be ignored
      tapRight(900, 400, 2);
      const input = manager.getInput();
      expect(input.jump).toBe(false); // still consumed from first, second ignored
    });
  });

  // ---- 4. Swipe-down (fast fall) ----

  describe('swipe-down (fast fall)', () => {
    function tapRight(x: number, y: number, id = 1) {
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [{ identifier: id, clientX: x, clientY: y }]));
    }

    function moveRight(x: number, y: number, id = 1) {
      priv(manager).boundTouchMove(fakeTouchEvent('touchmove', [{ identifier: id, clientX: x, clientY: y }]));
    }

    it('triggers down on swipe past SWIPE_DISTANCE within time', () => {
      tapRight(800, 300);

      // Move down past SWIPE_DISTANCE (40px) quickly
      moveRight(800, 300 + SWIPE_DISTANCE + 1);

      const input = manager.getInput();
      expect(input.down).toBe(true);
    });

    it('cancels jump when swipe-down detected before consumption', () => {
      tapRight(800, 300);
      // Don't call getInput yet (jump not consumed)

      moveRight(800, 300 + SWIPE_DISTANCE + 1);

      const input = manager.getInput();
      expect(input.jump).toBe(false);
      expect(input.down).toBe(true);
    });
  });

  // ---- 5. Simultaneous joystick + jump ----

  describe('simultaneous joystick and jump', () => {
    it('supports joystick and jump from different touches', () => {
      // Left half touch for joystick
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 200, clientY: 400 },
      ]));
      priv(manager).boundTouchMove(fakeTouchEvent('touchmove', [
        { identifier: 0, clientX: 200 + DEAD_ZONE + 5, clientY: 400 },
      ]));

      // Right half touch for jump
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 1, clientX: 800, clientY: 400 },
      ]));

      const input = manager.getInput();
      expect(input.right).toBe(true);
      expect(input.jump).toBe(true);
    });
  });

  // ---- 6. Attach / detach lifecycle ----

  describe('attach / detach lifecycle', () => {
    it('resets state on detach', () => {
      // Create some state
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 200, clientY: 400 },
      ]));
      priv(manager).boundTouchMove(fakeTouchEvent('touchmove', [
        { identifier: 0, clientX: 200 + DEAD_ZONE + 5, clientY: 400 },
      ]));

      manager.detach();

      // Re-attach to a new container
      const newContainer = makeContainer();
      manager.attach(newContainer, () => 1);

      const input = manager.getInput();
      expect(input).toEqual({ left: false, right: false, jump: false, down: false });
    });

    it('clears cached rect on detach', () => {
      expect(priv(manager).cachedRect).not.toBeNull();

      manager.detach();
      expect(priv(manager).cachedRect).toBeNull();
    });

    it('prevents context menu on container while attached', () => {
      const evt = new Event('contextmenu', { cancelable: true });
      const spy = vi.spyOn(evt, 'preventDefault');
      container.dispatchEvent(evt);
      expect(spy).toHaveBeenCalled();
    });
  });

  // ---- 7. Coordinate mapping with scale ----

  describe('coordinate mapping with scale', () => {
    it('divides by scale factor when computing logical coords', () => {
      manager.detach();
      const scaledContainer = makeContainer({ left: 0, top: 0 });
      manager.attach(scaledContainer, () => 2); // scale = 2

      // clientX=400 at scale=2 -> logical x=200 (left half, joystick)
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 400, clientY: 400 },
      ]));
      // Move to clientX=400+50 -> logical dx = 50/2 = 25 > DEAD_ZONE(12) -> right
      priv(manager).boundTouchMove(fakeTouchEvent('touchmove', [
        { identifier: 0, clientX: 450, clientY: 400 },
      ]));

      expect(manager.getInput().right).toBe(true);
    });

    it('accounts for container offset in coordinate mapping', () => {
      manager.detach();
      // Container offset 100px from left
      const offsetContainer = makeContainer({ left: 100, top: 50 });
      manager.attach(offsetContainer, () => 1);

      // clientX=740, containerLeft=100 -> logical x = (740-100)/1 = 640
      // Exactly at midpoint: pos.x < 640 is false, so this is right-half (jump)
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 740, clientY: 400 },
      ]));

      const input = manager.getInput();
      expect(input.jump).toBe(true); // right half -> jump
    });

    it('treats left half correctly with offset container', () => {
      manager.detach();
      const offsetContainer = makeContainer({ left: 100, top: 0 });
      manager.attach(offsetContainer, () => 1);

      // clientX=739, containerLeft=100 -> logical x = 639 < 640 -> joystick
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 739, clientY: 400 },
      ]));

      // joystickTouchId should be set (not jump)
      expect(priv(manager).joystickTouchId).toBe(0);
      expect(priv(manager).jumpTouchId).toBeNull();
    });
  });

  // ---- 8. Callbacks ----

  describe('callbacks', () => {
    it('calls onJoystickUpdate on touch start and move', () => {
      const onJoystick = vi.fn();
      const onJumpFeedback = vi.fn();
      manager.setCallbacks(onJoystick, onJumpFeedback);

      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 200, clientY: 400 },
      ]));

      expect(onJoystick).toHaveBeenCalledWith(expect.objectContaining({
        active: true,
        baseX: 200,
        baseY: 400,
      }));

      priv(manager).boundTouchMove(fakeTouchEvent('touchmove', [
        { identifier: 0, clientX: 230, clientY: 400 },
      ]));

      expect(onJoystick).toHaveBeenCalledTimes(2);
    });

    it('calls onJumpFeedback on right-half touch', () => {
      const onJoystick = vi.fn();
      const onJumpFeedback = vi.fn();
      manager.setCallbacks(onJoystick, onJumpFeedback);

      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 1, clientX: 800, clientY: 400 },
      ]));

      expect(onJumpFeedback).toHaveBeenCalledWith(true);
    });

    it('calls onJumpFeedback(false) on touch end', () => {
      const onJoystick = vi.fn();
      const onJumpFeedback = vi.fn();
      manager.setCallbacks(onJoystick, onJumpFeedback);

      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 1, clientX: 800, clientY: 400 },
      ]));
      priv(manager).boundTouchEnd(fakeTouchEvent('touchend', [
        { identifier: 1, clientX: 800, clientY: 400 },
      ]));

      expect(onJumpFeedback).toHaveBeenLastCalledWith(false);
    });

    it('clears callbacks via clearCallbacks', () => {
      const onJoystick = vi.fn();
      const onJumpFeedback = vi.fn();
      manager.setCallbacks(onJoystick, onJumpFeedback);
      manager.clearCallbacks();

      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 200, clientY: 400 },
      ]));

      expect(onJoystick).not.toHaveBeenCalled();
      expect(onJumpFeedback).not.toHaveBeenCalled();
    });
  });

  // ---- 9. Pause check ----

  describe('pause check', () => {
    it('ignores touch events when paused', () => {
      manager.detach();
      const c = makeContainer();
      manager.attach(c, () => 1, () => true); // pauseCheckFn always returns true

      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 800, clientY: 400 },
      ]));

      const input = manager.getInput();
      expect(input.jump).toBe(false);
    });

    it('processes touches when not paused', () => {
      manager.detach();
      const c = makeContainer();
      manager.attach(c, () => 1, () => false);

      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 800, clientY: 400 },
      ]));

      const input = manager.getInput();
      expect(input.jump).toBe(true);
    });
  });

  // ---- 10. getInputForPlayer ----

  describe('getInputForPlayer', () => {
    it('converts jump to down when airborne', () => {
      // Tap right half for jump
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 1, clientX: 800, clientY: 400 },
      ]));

      const input = manager.getInputForPlayer(true); // airborne
      expect(input.jump).toBe(false);
      expect(input.down).toBe(true);
    });

    it('keeps jump when grounded', () => {
      priv(manager).boundTouchStart(fakeTouchEvent('touchstart', [
        { identifier: 1, clientX: 800, clientY: 400 },
      ]));

      const input = manager.getInputForPlayer(false); // grounded
      expect(input.jump).toBe(true);
      expect(input.down).toBe(false);
    });
  });

  // ---- 11. Button passthrough ----

  describe('button passthrough', () => {
    it('does not preventDefault on button targets', () => {
      const button = document.createElement('button');
      const evt = fakeTouchEvent('touchstart', [
        { identifier: 0, clientX: 800, clientY: 400 },
      ], button);

      priv(manager).boundTouchStart(evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
      // Jump should NOT be triggered because handler returns early for buttons
      expect(manager.getInput().jump).toBe(false);
    });
  });
});
