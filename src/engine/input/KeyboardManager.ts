// src/engine/input/KeyboardManager.ts
import type { CharacterSlot, InputState, KeyBindings } from '../types';

export const KEY_BINDINGS: Record<CharacterSlot, KeyBindings> = {
  P1: { left: 'a', right: 'd', jump: 'w', down: 's' },
  P2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown' },
  P3: { left: 'j', right: 'l', jump: 'i', down: 'k' },
  P4: { left: 'f', right: 'h', jump: 't', down: 'g' },
  P5: { left: '4', right: '6', jump: '8', down: '5' },
};

/** Frozen entries snapshot used by hot paths so `Object.entries(...)` doesn't
 *  allocate a fresh `[slot, binding][]` array on every keyup / readAny tick. */
const BINDING_ENTRIES = Object.entries(KEY_BINDINGS) as [CharacterSlot, KeyBindings][];

/**
 * Owns window keyboard listeners and pressed-key state.
 * Per-slot KeyboardInput instances share one KeyboardManager.
 */
export class KeyboardManager {
  private keys: Set<string> = new Set();
  private pendingJumps: Set<CharacterSlot> = new Set();
  private changeListener: (() => void) | null = null;

  /** Browser adapters may publish held levels and jump edges immediately. */
  setChangeListener(listener: (() => void) | null): void { this.changeListener = listener; }
  clearPendingJumps(): void { this.pendingJumps.clear(); }
  /** Per-slot output scratches reused across reads. Each slot's InputState is
   *  written in place by `readSlot`; the merged `readAny` writes its own. */
  private readonly _slotInputs: Record<CharacterSlot, InputState> = {
    P1: { left: false, right: false, jump: false, down: false },
    P2: { left: false, right: false, jump: false, down: false },
    P3: { left: false, right: false, jump: false, down: false },
    P4: { left: false, right: false, jump: false, down: false },
    P5: { left: false, right: false, jump: false, down: false },
  };
  private readonly _anyInput: InputState = { left: false, right: false, jump: false, down: false };

  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    e.preventDefault();
    const key = this.normalizeKey(e.key);
    if (this.keys.has(key)) return; // OS repeat is not another press.
    this.keys.add(key);
    for (const [slot, binding] of BINDING_ENTRIES) {
      if (key === binding.jump) this.pendingJumps.add(slot);
    }
    this.changeListener?.();
  };

  private readonly _onKeyUp = (e: KeyboardEvent): void => {
    e.preventDefault();
    if (!this.keys.delete(this.normalizeKey(e.key))) return;
    // A completed quick tap must survive until its input reader consumes it.
    this.changeListener?.();
  };

  attach(): void {
    // In the sim-worker bundle (dev, where the stub alias doesn't fire) `window`
    // is undefined — guard so attach/detach don't throw on match teardown.
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  detach(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.keys.clear();
    this.pendingJumps.clear();
  }

  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }

  isAnyKeyDown(): boolean {
    return this.keys.size > 0;
  }

  /** Read pressed-key state for a slot. Used by KeyboardInput.getAction().
   *  Returns a per-slot stable scratch — caller must consume synchronously. */
  readSlot(slot: CharacterSlot): InputState {
    const b = KEY_BINDINGS[slot];
    const jumpEdge = this.pendingJumps.delete(slot);
    const out = this._slotInputs[slot];
    out.left = this.keys.has(b.left);
    out.right = this.keys.has(b.right);
    out.jump = jumpEdge;
    out.down = this.keys.has(b.down);
    return out;
  }

  /** Read input from ALL key bindings merged (for online play — any keys work).
   *  Returns a shared scratch — caller must consume synchronously. */
  readAny(): InputState {
    let left = false, right = false, jump = false, down = false;
    for (const [slot, b] of BINDING_ENTRIES) {
      if (this.keys.has(b.left)) left = true;
      if (this.keys.has(b.right)) right = true;
      if (this.keys.has(b.down)) down = true;
      if (this.pendingJumps.delete(slot)) jump = true;
    }
    const out = this._anyInput;
    out.left = left; out.right = right; out.jump = jump; out.down = down;
    return out;
  }

  private normalizeKey(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key;
  }
}
