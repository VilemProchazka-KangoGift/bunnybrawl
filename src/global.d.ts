import type { GameLoop } from './engine/gameLoop';

/**
 * Global type extensions for E2E test hooks, vendor-prefixed CSS, and Screen Orientation API.
 */
declare global {
  interface Window {
    __gameStore?: import('zustand').UseBoundStore<import('zustand').StoreApi<import('./store/gameStore').GameStore>>;
    __gameLoop?: GameLoop;
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
