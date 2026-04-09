import type { InputState } from './types';
import { CANVAS_WIDTH } from './constants';

// Tuning constants
const DEAD_ZONE = 12;
const MAX_RADIUS = 60;
const SWIPE_DISTANCE = 40;
const SWIPE_MAX_TIME = 300;

export interface JoystickCallbackData {
  baseX: number;
  baseY: number;
  thumbX: number;
  thumbY: number;
  active: boolean;
}

export class TouchInputManager {
  // Joystick state (left half)
  private joystickTouchId: number | null = null;
  private joystickBaseX = 0;
  private joystickBaseY = 0;
  private leftActive = false;
  private rightActive = false;

  // Jump/fast-fall state (right half)
  private jumpTouchId: number | null = null;
  private jumpStartY = 0;
  private jumpStartTime = 0;
  private jumpTriggered = false;
  private jumpConsumed = false;
  private downFromSwipe = false;

  // Container & scale
  private containerEl: HTMLElement | null = null;
  private scaleFn: (() => number) | null = null;
  private pauseCheckFn: (() => boolean) | null = null;

  // Cached layout (updated on resize, avoids per-touch reflow)
  private cachedRect: DOMRect | null = null;
  private cachedScale = 1;

  // Visual callbacks
  private onJoystickUpdate: ((data: JoystickCallbackData) => void) | null = null;
  private onJumpFeedback: ((active: boolean) => void) | null = null;

  // Bound handlers for cleanup
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundContextMenu: (e: Event) => void;
  private boundResize: (() => void) | null = null;

  constructor() {
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    this.boundContextMenu = (e: Event) => e.preventDefault();
  }

  attach(
    containerEl: HTMLElement,
    scaleFn: () => number,
    pauseCheckFn?: () => boolean,
  ): void {
    this.containerEl = containerEl;
    this.scaleFn = scaleFn;
    this.pauseCheckFn = pauseCheckFn ?? null;

    this.updateCachedLayout();
    this.boundResize = () => this.updateCachedLayout();
    window.addEventListener('resize', this.boundResize);

    document.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    document.addEventListener('touchcancel', this.boundTouchEnd, { passive: false });
    containerEl.addEventListener('contextmenu', this.boundContextMenu);

    // Prevent scroll/zoom/text-selection
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';
    containerEl.style.userSelect = 'none';
    containerEl.style.webkitUserSelect = 'none';
  }

  setCallbacks(
    onJoystickUpdate: (data: JoystickCallbackData) => void,
    onJumpFeedback: (active: boolean) => void,
  ): void {
    this.onJoystickUpdate = onJoystickUpdate;
    this.onJumpFeedback = onJumpFeedback;
  }

  clearCallbacks(): void {
    this.onJoystickUpdate = null;
    this.onJumpFeedback = null;
  }

  detach(): void {
    document.removeEventListener('touchstart', this.boundTouchStart);
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend', this.boundTouchEnd);
    document.removeEventListener('touchcancel', this.boundTouchEnd);
    if (this.boundResize) {
      window.removeEventListener('resize', this.boundResize);
      this.boundResize = null;
    }
    if (this.containerEl) {
      this.containerEl.removeEventListener('contextmenu', this.boundContextMenu);
      this.containerEl.style.userSelect = '';
      this.containerEl.style.webkitUserSelect = '';
    }
    document.body.style.touchAction = '';
    document.body.style.overscrollBehavior = '';

    this.resetJoystick();
    this.resetJump();
    this.containerEl = null;
    this.scaleFn = null;
    this.pauseCheckFn = null;
    this.cachedRect = null;
  }

  getInput(): InputState {
    const jump = this.jumpTriggered && !this.jumpConsumed;
    if (jump) this.jumpConsumed = true;

    return {
      left: this.leftActive,
      right: this.rightActive,
      jump,
      down: this.downFromSwipe,
    };
  }

  private updateCachedLayout(): void {
    if (this.containerEl && this.scaleFn) {
      this.cachedRect = this.containerEl.getBoundingClientRect();
      this.cachedScale = this.scaleFn();
    }
  }

  private toLogicalCoords(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.cachedRect) return { x: 0, y: 0 };
    return {
      x: (clientX - this.cachedRect.left) / this.cachedScale,
      y: (clientY - this.cachedRect.top) / this.cachedScale,
    };
  }

  private handleTouchStart(e: TouchEvent): void {
    if (this.pauseCheckFn?.()) return;
    // Don't preventDefault on UI buttons (pause, back) — let click events fire
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) return;
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const pos = this.toLogicalCoords(touch.clientX, touch.clientY);

      if (pos.x < CANVAS_WIDTH / 2) {
        if (this.joystickTouchId === null) {
          this.joystickTouchId = touch.identifier;
          this.joystickBaseX = pos.x;
          this.joystickBaseY = pos.y;
          this.leftActive = false;
          this.rightActive = false;

          this.onJoystickUpdate?.({
            baseX: pos.x, baseY: pos.y,
            thumbX: pos.x, thumbY: pos.y,
            active: true,
          });
        }
      } else {
        if (this.jumpTouchId === null) {
          this.jumpTouchId = touch.identifier;
          this.jumpStartY = pos.y;
          this.jumpStartTime = performance.now();
          this.jumpTriggered = true;
          this.jumpConsumed = false;
          this.downFromSwipe = false;
          this.onJumpFeedback?.(true);
        }
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (this.pauseCheckFn?.()) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) return;
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === this.joystickTouchId) {
        const pos = this.toLogicalCoords(touch.clientX, touch.clientY);
        const dx = pos.x - this.joystickBaseX;
        const absDx = Math.abs(dx);

        // Horizontal-only joystick
        if (absDx < DEAD_ZONE) {
          this.leftActive = false;
          this.rightActive = false;
        } else {
          this.leftActive = dx < 0;
          this.rightActive = dx > 0;
        }

        // Clamp thumb horizontally
        const clampedDx = Math.min(Math.max(dx, -MAX_RADIUS), MAX_RADIUS);
        this.onJoystickUpdate?.({
          baseX: this.joystickBaseX,
          baseY: this.joystickBaseY,
          thumbX: this.joystickBaseX + clampedDx,
          thumbY: this.joystickBaseY,
          active: true,
        });
      }

      if (touch.identifier === this.jumpTouchId) {
        const pos = this.toLogicalCoords(touch.clientX, touch.clientY);
        const dy = pos.y - this.jumpStartY;
        const elapsed = performance.now() - this.jumpStartTime;

        if (dy > SWIPE_DISTANCE && elapsed < SWIPE_MAX_TIME) {
          this.downFromSwipe = true;
          if (!this.jumpConsumed) {
            this.jumpTriggered = false;
          }
        }
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.joystickTouchId) this.resetJoystick();
      if (touch.identifier === this.jumpTouchId) this.resetJump();
    }
  }

  private resetJoystick(): void {
    this.joystickTouchId = null;
    this.leftActive = false;
    this.rightActive = false;
    this.onJoystickUpdate?.({ baseX: 0, baseY: 0, thumbX: 0, thumbY: 0, active: false });
  }

  private resetJump(): void {
    this.jumpTouchId = null;
    this.jumpTriggered = false;
    this.jumpConsumed = false;
    this.downFromSwipe = false;
    this.onJumpFeedback?.(false);
  }
}
