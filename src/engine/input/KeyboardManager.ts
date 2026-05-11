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
  private jumpPressed: Map<CharacterSlot, boolean> = new Map();
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
    this.keys.add(this.normalizeKey(e.key));
  };

  private readonly _onKeyUp = (e: KeyboardEvent): void => {
    e.preventDefault();
    const key = this.normalizeKey(e.key);
    this.keys.delete(key);
    for (const [slot, b] of BINDING_ENTRIES) {
      if (key === b.jump) this.jumpPressed.set(slot, false);
    }
  };

  attach(): void {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.keys.clear();
    this.jumpPressed.clear();
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
    const jumpHeld = this.keys.has(b.jump);
    const jumpEdge = jumpHeld && !this.jumpPressed.get(slot);
    if (jumpEdge) this.jumpPressed.set(slot, true);
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
      if (this.keys.has(b.jump) && !this.jumpPressed.get(slot)) {
        jump = true;
        this.jumpPressed.set(slot, true);
      }
    }
    const out = this._anyInput;
    out.left = left; out.right = right; out.jump = jump; out.down = down;
    return out;
  }

  private normalizeKey(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key;
  }
}
