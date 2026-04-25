// src/engine/input/__tests__/KeyboardInput.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeyboardManager } from '../KeyboardManager';
import { KeyboardInput } from '../KeyboardInput';
import type { MatchState } from '../../types';

const fakeState = {} as MatchState;

describe('KeyboardManager + KeyboardInput', () => {
  let mgr: KeyboardManager;

  beforeEach(() => {
    mgr = new KeyboardManager();
    mgr.attach();
  });

  afterEach(() => {
    mgr.detach();
  });

  it('maps P1 keys (a/d/w/s) to left/right/jump/down', () => {
    const input = new KeyboardInput('P1', mgr);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    expect(input.getAction(fakeState)).toEqual({ left: false, right: true, jump: false, down: false });

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(input.getAction(fakeState).jump).toBe(true);
    // Jump only fires once per press
    expect(input.getAction(fakeState).jump).toBe(false);
  });

  it('detach clears state and listeners', () => {
    const input = new KeyboardInput('P2', mgr);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(input.getAction(fakeState).right).toBe(true);
    mgr.detach();
    // After detach, keys are cleared
    expect(input.getAction(fakeState).right).toBe(false);
  });

  it('two KeyboardInputs for different slots are independent', () => {
    const p1 = new KeyboardInput('P1', mgr);
    const p2 = new KeyboardInput('P2', mgr);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));        // P1 right
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); // P2 left

    expect(p1.getAction(fakeState).right).toBe(true);
    expect(p2.getAction(fakeState).left).toBe(true);
  });
});
