import type { perfTrace } from './engine/perfTrace';
import type * as fpsCounter from './engine/fpsCounter';

/**
 * Global type extensions for E2E test hooks, vendor-prefixed CSS, and Screen Orientation API.
 *
 * E2E diagnostic snapshot lives on `window.__bunnyTest` — declared in
 * `src/components/bunnyTestShim.ts` via `declare global`.
 */
declare global {
  interface Window {
    __perfTrace?: typeof perfTrace;
    __fpsCounter?: typeof fpsCounter;
  }

  interface CSSStyleDeclaration {
    webkitUserSelect: string;
  }

  // Screen Orientation API (W3C spec, not yet in all TS lib versions)
  interface ScreenOrientation {
    lock(orientation: OrientationLockType): Promise<void>;
    unlock(): void;
  }

  // Keyboard Lock API (Chromium-only; absent in Firefox/Safari — hence optional)
  interface Navigator {
    keyboard?: {
      lock(keyCodes?: string[]): Promise<void>;
      unlock(): void;
    };
  }
}

export {};
