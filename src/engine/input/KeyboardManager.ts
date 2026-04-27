// src/engine/input/KeyboardManager.ts
import type { CharacterSlot, KeyBindings } from '../types';

export const KEY_BINDINGS: Record<CharacterSlot, KeyBindings> = {
  P1: { left: 'a', right: 'd', jump: 'w', down: 's' },
  P2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown' },
  P3: { left: 'j', right: 'l', jump: 'i', down: 'k' },
  P4: { left: 'f', right: 'h', jump: 't', down: 'g' },
  P5: { left: '4', right: '6', jump: '8', down: '5' },
};

/**
 * Owns window keyboard listeners and pressed-key state.
 * Per-slot KeyboardInput instances share one KeyboardManager.
 */
export class KeyboardManager {
  private keys: Set<string> = new Set();
  private jumpPressed: Map<CharacterSlot, boolean> = new Map();

  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    e.preventDefault();
    this.keys.add(this.normalizeKey(e.key));
  };

  private readonly _onKeyUp = (e: KeyboardEvent): void => {
    e.preventDefault();
    const key = this.normalizeKey(e.key);
    this.keys.delete(key);
    for (const [slot, b] of Object.entries(KEY_BINDINGS)) {
      if (key === b.jump) this.jumpPressed.set(slot as CharacterSlot, false);
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

  /** Read pressed-key state for a slot. Used by KeyboardInput.getAction(). */
  readSlot(slot: CharacterSlot): { left: boolean; right: boolean; jump: boolean; down: boolean } {
    const b = KEY_BINDINGS[slot];
    const jumpHeld = this.keys.has(b.jump);
    const jumpEdge = jumpHeld && !this.jumpPressed.get(slot);
    if (jumpEdge) this.jumpPressed.set(slot, true);
    return {
      left: this.keys.has(b.left),
      right: this.keys.has(b.right),
      jump: jumpEdge,
      down: this.keys.has(b.down),
    };
  }

  /** Read input from ALL key bindings merged (for online play — any keys work). */
  readAny(): { left: boolean; right: boolean; jump: boolean; down: boolean } {
    let left = false, right = false, jump = false, down = false;
    for (const [slot, b] of Object.entries(KEY_BINDINGS)) {
      if (this.keys.has(b.left)) left = true;
      if (this.keys.has(b.right)) right = true;
      if (this.keys.has(b.down)) down = true;
      if (this.keys.has(b.jump) && !this.jumpPressed.get(slot as CharacterSlot)) {
        jump = true;
        this.jumpPressed.set(slot as CharacterSlot, true);
      }
    }
    return { left, right, jump, down };
  }

  private normalizeKey(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key;
  }
}
