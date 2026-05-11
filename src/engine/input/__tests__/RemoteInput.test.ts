// src/engine/input/__tests__/RemoteInput.test.ts
import { describe, it, expect } from 'vitest';
import { RemoteInput } from '../RemoteInput';
import { makePlayer, makeState } from '../../__tests__/testHelpers';
import type { InputState, PlayerSlot } from '../../types';

describe('RemoteInput', () => {
  it('returns the buffered input verbatim when present and player is grounded', () => {
    const buffer = new Map<PlayerSlot, InputState>();
    const raw: InputState = { left: true, right: false, jump: false, down: false };
    buffer.set('P1', raw);
    const remote = new RemoteInput('P1' as PlayerSlot);
    const state = makeState({ players: [makePlayer({ id: 'P1', state: 'idle' })] });

    expect(remote.getAction(state, { networkInputs: buffer })).toBe(raw);
  });

  it('returns all-false when the slot is missing from the buffer', () => {
    const buffer = new Map<PlayerSlot, InputState>();
    const remote = new RemoteInput('P1' as PlayerSlot);
    const state = makeState({ players: [] });

    expect(remote.getAction(state, { networkInputs: buffer })).toEqual({ left: false, right: false, jump: false, down: false });
  });

  it('returns all-false when ctx is omitted entirely', () => {
    const remote = new RemoteInput('P1' as PlayerSlot);
    const state = makeState({ players: [] });

    expect(remote.getAction(state)).toEqual({ left: false, right: false, jump: false, down: false });
  });

  it('passes airborne+jump through verbatim (no fast-fall conversion)', () => {
    // Regression: the conversion used to live here, but it turned every
    // keyboard `jump`-press into a fast-fall in sim-worker mode and for
    // online keyboard guests. The touch source is the only path that
    // should map an airborne tap to fast-fall — and it does, via
    // `TouchInputManager.getInputForPlayer(airborne)`.
    const buffer = new Map<PlayerSlot, InputState>();
    const raw: InputState = { left: true, right: false, jump: true, down: false };
    buffer.set('P1', raw);
    const remote = new RemoteInput('P1' as PlayerSlot);
    const state = makeState({ players: [makePlayer({ id: 'P1', state: 'airborne' })] });

    expect(remote.getAction(state, { networkInputs: buffer })).toBe(raw);
  });

  it('passes grounded+jump through verbatim', () => {
    const buffer = new Map<PlayerSlot, InputState>();
    const raw: InputState = { left: false, right: true, jump: true, down: false };
    buffer.set('P1', raw);
    const remote = new RemoteInput('P1' as PlayerSlot);
    const state = makeState({ players: [makePlayer({ id: 'P1', state: 'idle' })] });

    expect(remote.getAction(state, { networkInputs: buffer })).toBe(raw);
  });

  it('passes airborne+down through verbatim (touch source already converted)', () => {
    const buffer = new Map<PlayerSlot, InputState>();
    const raw: InputState = { left: false, right: true, jump: false, down: true };
    buffer.set('P1', raw);
    const remote = new RemoteInput('P1' as PlayerSlot);
    const state = makeState({ players: [makePlayer({ id: 'P1', state: 'airborne' })] });

    expect(remote.getAction(state, { networkInputs: buffer })).toBe(raw);
  });

  it('sees buffer mutations between calls', () => {
    const buffer = new Map<PlayerSlot, InputState>();
    const remote = new RemoteInput('P1' as PlayerSlot);
    const state = makeState({ players: [makePlayer({ id: 'P1', state: 'idle' })] });
    const ctx = { networkInputs: buffer };

    expect(remote.getAction(state, ctx)).toEqual({ left: false, right: false, jump: false, down: false });

    buffer.set('P1', { left: true, right: false, jump: false, down: false });
    expect(remote.getAction(state, ctx)).toEqual({ left: true, right: false, jump: false, down: false });
  });

  it('exposes the slot passed to the constructor', () => {
    const remote = new RemoteInput('B2' as PlayerSlot);
    expect(remote.slot).toBe('B2');
  });
});
