import type { CharacterSlot, InputState, KeyBindings } from './types';

export const KEY_BINDINGS: Record<CharacterSlot, KeyBindings> = {
  P1: { left: 'a', right: 'd', jump: 'w', down: 's' },
  P2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown' },
  P3: { left: 'j', right: 'l', jump: 'i', down: 'k' },
  P4: { left: 'f', right: 'h', jump: 't', down: 'g' },
  P5: { left: '4', right: '6', jump: '8', down: '5' },
};

export class InputManager {
  private keys: Set<string> = new Set();
  private jumpPressed: Map<CharacterSlot, boolean> = new Map();
  private readonly _anyInput: InputState = { left: false, right: false, jump: false, down: false };

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }

  attach(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.keys.clear();
    this.jumpPressed.clear();
  }

  private normalizeKey(key: string): string {
    // Arrow keys stay as-is, letters become lowercase so CapsLock doesn't matter
    return key.length === 1 ? key.toLowerCase() : key;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    e.preventDefault();
    this.keys.add(this.normalizeKey(e.key));
  }

  private handleKeyUp(e: KeyboardEvent): void {
    e.preventDefault();
    this.keys.delete(this.normalizeKey(e.key));

    // Reset jump pressed state when jump key is released
    const normalized = this.normalizeKey(e.key);
    for (const [slot, bindings] of Object.entries(KEY_BINDINGS)) {
      if (normalized === bindings.jump) {
        this.jumpPressed.set(slot as CharacterSlot, false);
      }
    }
  }

  getInput(slot: CharacterSlot): InputState {
    const bindings = KEY_BINDINGS[slot];
    const jump = this.keys.has(bindings.jump) && !this.jumpPressed.get(slot);

    // Mark jump as consumed so it's only triggered once per press
    if (jump) {
      this.jumpPressed.set(slot, true);
    }

    return {
      left: this.keys.has(bindings.left),
      right: this.keys.has(bindings.right),
      jump,
      down: this.keys.has(bindings.down),
    };
  }

  /** Read input from ALL key bindings merged (for online play — any keys work). */
  getInputAny(): InputState {
    let left = false, right = false, jump = false, down = false;
    for (const [slot, bindings] of Object.entries(KEY_BINDINGS)) {
      if (this.keys.has(bindings.left)) left = true;
      if (this.keys.has(bindings.right)) right = true;
      if (this.keys.has(bindings.down)) down = true;
      if (this.keys.has(bindings.jump) && !this.jumpPressed.get(slot as CharacterSlot)) {
        jump = true;
        this.jumpPressed.set(slot as CharacterSlot, true);
      }
    }
    this._anyInput.left = left;
    this._anyInput.right = right;
    this._anyInput.jump = jump;
    this._anyInput.down = down;
    return this._anyInput;
  }

  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }

  isAnyKeyDown(): boolean {
    return this.keys.size > 0;
  }
}
