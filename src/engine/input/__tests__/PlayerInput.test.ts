// src/engine/input/__tests__/PlayerInput.test.ts
import { describe, it, expect } from 'vitest';
import type { PlayerInput } from '../PlayerInput';
import type { MatchState, InputState } from '../../types';

describe('PlayerInput contract', () => {
  it('is a structural type implementable by any object', () => {
    const stub: PlayerInput = {
      slot: 'P1',
      getAction: (_state: Readonly<MatchState>): InputState => ({
        left: false, right: false, jump: false, down: false,
      }),
      dispose: () => {},
    };
    expect(stub.slot).toBe('P1');
    const action = stub.getAction({} as MatchState);
    expect(action).toEqual({ left: false, right: false, jump: false, down: false });
  });

  it('dispose is optional', () => {
    const stub: PlayerInput = {
      slot: 'B1',
      getAction: () => ({ left: false, right: false, jump: false, down: false }),
      // no dispose
    };
    expect(stub.dispose).toBeUndefined();
  });
});
