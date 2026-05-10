// Phase 2 Task 12 — guest-side snapshot decode + interpolation seam.
// Drives the worker module exports directly (no Worker spawn) the same
// way hostSnapshotEmit.test.ts drives the host-side encode helper.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  setNetMode, applyIncomingSnapshot, takeAndEncodeForHost,
  getGuestInterpDepth, getNetMode,
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

beforeEach(() => {
  // Default to a clean guest state for each test. Tests that want host
  // or off mode flip it explicitly.
  setNetMode('guest', 2);
});

function newHostSim(): Simulator {
  return new Simulator({
    arena: makeArena(),
    settings: makeSettings(),
    activePlayers: ['P1', 'P2'],
    events: new CapturedEvents(),
  });
}

describe('applyIncomingSnapshot', () => {
  it('zero-byte buffer is a no-op (defensive: don\'t crash on premature wake)', () => {
    expect(() => applyIncomingSnapshot(new ArrayBuffer(0))).not.toThrow();
    expect(getGuestInterpDepth()).toBe(0);
  });

  it('ignores snapshots when netMode is off (Phase 1 default)', () => {
    setNetMode('off');
    expect(getNetMode()).toBe('off');
    // Build a real encoded buffer from a host sim, then post it.
    setNetMode('host', 0);
    const sim = newHostSim();
    const buf = takeAndEncodeForHost(sim);
    setNetMode('off');
    applyIncomingSnapshot(buf);
    // No interp to grow because we're in 'off' — exporter returns 0.
    expect(getGuestInterpDepth()).toBe(0);
  });

  it('grows the interpolation buffer when a valid snapshot is applied', () => {
    // Encode against a separate host-mode sim, then feed the buffer
    // into the guest-mode applyIncomingSnapshot path.
    setNetMode('host', 0);
    const sim = newHostSim();
    const buf = takeAndEncodeForHost(sim);

    setNetMode('guest', 2);
    expect(getGuestInterpDepth()).toBe(0);
    applyIncomingSnapshot(buf);
    expect(getGuestInterpDepth()).toBe(1);
  });

  it('multiple snapshots stack into the ring', () => {
    setNetMode('host', 0);
    const sim = newHostSim();
    const buf1 = takeAndEncodeForHost(sim);
    const buf2 = takeAndEncodeForHost(sim);
    const buf3 = takeAndEncodeForHost(sim);

    setNetMode('guest', 2);
    applyIncomingSnapshot(buf1);
    applyIncomingSnapshot(buf2);
    applyIncomingSnapshot(buf3);
    expect(getGuestInterpDepth()).toBe(3);
  });

  it('setNetMode transition out of guest tears down the interpolation buffer', () => {
    setNetMode('host', 0);
    const sim = newHostSim();
    const buf = takeAndEncodeForHost(sim);

    setNetMode('guest', 2);
    applyIncomingSnapshot(buf);
    expect(getGuestInterpDepth()).toBe(1);

    setNetMode('off');
    // Exporter falls through to 0 when guestInterp is null.
    expect(getGuestInterpDepth()).toBe(0);
  });
});
