import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputManager, KEY_BINDINGS } from './input';

describe('InputManager', () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
    input.attach();
  });

  afterEach(() => {
    input.detach();
  });

  function pressKey(key: string) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  }

  function releaseKey(key: string) {
    window.dispatchEvent(new KeyboardEvent('keyup', { key }));
  }

  it('detects P1 left key', () => {
    pressKey('a');
    const state = input.getInput('P1');
    expect(state.left).toBe(true);
    expect(state.right).toBe(false);
  });

  it('detects P1 right key', () => {
    pressKey('d');
    const state = input.getInput('P1');
    expect(state.right).toBe(true);
  });

  it('detects P1 jump key (single press)', () => {
    pressKey('w');
    const state = input.getInput('P1');
    expect(state.jump).toBe(true);

    // Second read should not trigger jump again (consumed)
    const state2 = input.getInput('P1');
    expect(state2.jump).toBe(false);
  });

  it('allows jump again after key release', () => {
    pressKey('w');
    input.getInput('P1'); // consume jump

    releaseKey('w');
    pressKey('w');
    const state = input.getInput('P1');
    expect(state.jump).toBe(true);
  });

  it('detects P1 down key', () => {
    pressKey('s');
    const state = input.getInput('P1');
    expect(state.down).toBe(true);
  });

  it('detects P2 arrow keys', () => {
    pressKey('ArrowLeft');
    pressKey('ArrowUp');
    const state = input.getInput('P2');
    expect(state.left).toBe(true);
    expect(state.jump).toBe(true);
  });

  it('detects P2 down arrow', () => {
    pressKey('ArrowDown');
    const state = input.getInput('P2');
    expect(state.down).toBe(true);
  });

  it('detects P3 keys', () => {
    pressKey('j');
    pressKey('i');
    const state = input.getInput('P3');
    expect(state.left).toBe(true);
    expect(state.jump).toBe(true);
  });

  it('detects P4 keys', () => {
    pressKey('f');
    pressKey('h');
    pressKey('t');
    const state = input.getInput('P4');
    expect(state.left).toBe(true);
    expect(state.right).toBe(true);
    expect(state.jump).toBe(true);
  });

  it('clears keys on detach', () => {
    pressKey('a');
    input.detach();
    input.attach();
    const state = input.getInput('P1');
    expect(state.left).toBe(false);
  });

  it('isKeyDown works', () => {
    pressKey('a');
    expect(input.isKeyDown('a')).toBe(true);
    expect(input.isKeyDown('b')).toBe(false);
  });

  it('isAnyKeyDown works', () => {
    expect(input.isAnyKeyDown()).toBe(false);
    pressKey('a');
    expect(input.isAnyKeyDown()).toBe(true);
  });

  it('handles all four players simultaneously', () => {
    // Press all four players' left keys
    pressKey('a');          // P1
    pressKey('ArrowLeft');  // P2
    pressKey('j');          // P3
    pressKey('f');          // P4

    expect(input.getInput('P1').left).toBe(true);
    expect(input.getInput('P2').left).toBe(true);
    expect(input.getInput('P3').left).toBe(true);
    expect(input.getInput('P4').left).toBe(true);
  });

  it('P5 uses numpad keys', () => {
    pressKey('4'); // P5 left
    pressKey('6'); // P5 right
    const state = input.getInput('P5');
    expect(state.left).toBe(true);
    expect(state.right).toBe(true);
  });

  it('case-insensitive: uppercase A registers as P1 left', () => {
    pressKey('A');
    expect(input.getInput('P1').left).toBe(true);
  });

  it('case-insensitive: uppercase W registers as P1 jump', () => {
    pressKey('W');
    expect(input.getInput('P1').jump).toBe(true);
  });

  it('arrow keys are not lowercased', () => {
    pressKey('ArrowUp');
    expect(input.getInput('P2').jump).toBe(true);
  });

  it('getInputAny merges all key bindings', () => {
    pressKey('a');        // P1 left
    pressKey('ArrowUp');  // P2 jump
    const state = input.getInputAny();
    expect(state.left).toBe(true);
    expect(state.jump).toBe(true);
  });

  it('getInputAny consumes jump for all bindings', () => {
    pressKey('w'); // P1 jump
    const first = input.getInputAny();
    expect(first.jump).toBe(true);
    const second = input.getInputAny();
    expect(second.jump).toBe(false); // consumed
  });

  it('getInputAny down from any binding', () => {
    pressKey('s');        // P1 down
    const state = input.getInputAny();
    expect(state.down).toBe(true);
  });

  it('detach removes all listeners and clears state', () => {
    pressKey('a');
    expect(input.getInput('P1').left).toBe(true);
    input.detach();
    // After detach, new key presses don't register
    pressKey('d');
    // Re-attach to query
    input.attach();
    expect(input.getInput('P1').right).toBe(false);
    expect(input.getInput('P1').left).toBe(false); // cleared on detach
  });

  it('all 5 players have all 4 key bindings defined', () => {
    const slots = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
    for (const slot of slots) {
      const bindings = KEY_BINDINGS[slot];
      expect(bindings.left).toBeDefined();
      expect(bindings.right).toBeDefined();
      expect(bindings.jump).toBeDefined();
      expect(bindings.down).toBeDefined();
    }
  });

  it('no key binding conflicts between players', () => {
    const allKeys = new Set<string>();
    const slots = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
    for (const slot of slots) {
      const bindings = KEY_BINDINGS[slot];
      for (const key of [bindings.left, bindings.right, bindings.jump, bindings.down]) {
        expect(allKeys.has(key), `key '${key}' used by multiple players`).toBe(false);
        allKeys.add(key);
      }
    }
    // Total: 5 players × 4 keys = 20 unique keys
    expect(allKeys.size).toBe(20);
  });
});
