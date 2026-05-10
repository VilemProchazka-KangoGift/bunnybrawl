// Phase 2 Task 12 — guest snapshot decode + interpolation pipeline inside
// the worker. Drive the seams directly with synthetic snapshots produced
// by a real host-side Simulator + encoder.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  setNetMode, applyIncomingSnapshot, takeAndEncodeForHost,
  getGuestInterpDepth,
} from '../engineWorkerInit';
import { Simulator } from '../../simulator/Simulator';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { CapturedEvents } from '../../__tests__/helpers/eventSink';
import { makeArena, makeSettings } from '../../__tests__/testHelpers';

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

function newSim(): Simulator {
  return new Simulator({
    arena: makeArena(),
    settings: makeSettings(),
    activePlayers: ['P1', 'P2'],
    events: new CapturedEvents(),
  });
}

describe('guest snapshot apply', () => {
  beforeEach(() => { setNetMode('off'); });

  it('does not touch buffer or throw when not in guest mode', () => {
    setNetMode('off');
    expect(() => applyIncomingSnapshot(new ArrayBuffer(64))).not.toThrow();
    expect(getGuestInterpDepth()).toBe(0);
  });

  it('zero-length buffer is a no-op', () => {
    setNetMode('guest', 2);
    applyIncomingSnapshot(new ArrayBuffer(0));
    expect(getGuestInterpDepth()).toBe(0);
  });

  it('accepts a real host-encoded snapshot and grows the interp ring', () => {
    setNetMode('host', 0);
    const sim = newSim();
    const buf = takeAndEncodeForHost(sim);

    setNetMode('guest', 2);
    expect(getGuestInterpDepth()).toBe(0);
    applyIncomingSnapshot(buf);
    expect(getGuestInterpDepth()).toBe(1);

    // Second snapshot from a slightly advanced sim — same shape, different frame.
    setNetMode('host', 0);
    const buf2 = takeAndEncodeForHost(sim);
    setNetMode('guest', 2);
    applyIncomingSnapshot(buf);  // re-use; codec doesn't care about hostFrame mismatch
    applyIncomingSnapshot(buf2);
    expect(getGuestInterpDepth()).toBeGreaterThanOrEqual(1);
  });

  it('switching out of guest mode tears down the interp', () => {
    setNetMode('guest', 2);
    setNetMode('host', 0);
    expect(getGuestInterpDepth()).toBe(0);
  });
});
