// Phase 2 Task 10 — worker-side host snapshot encode seam. Drives the
// helper directly so we don't need to spawn a Worker.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  setNetMode, takeAndEncodeForHost, getHostFrame, getNetMode,
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

describe('takeAndEncodeForHost', () => {
  it('returns a non-empty ArrayBuffer for a fresh sim', () => {
    setNetMode('host', 0);
    const sim = newSim();
    const buf = takeAndEncodeForHost(sim);
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('advances host frame counter on each call', () => {
    setNetMode('host', 0);
    expect(getHostFrame()).toBe(0);
    const sim = newSim();
    takeAndEncodeForHost(sim);
    expect(getHostFrame()).toBe(1);
    takeAndEncodeForHost(sim);
    expect(getHostFrame()).toBe(2);
  });

  it('setNetMode resets host frame', () => {
    setNetMode('host', 0);
    const sim = newSim();
    takeAndEncodeForHost(sim);
    takeAndEncodeForHost(sim);
    expect(getHostFrame()).toBe(2);
    setNetMode('off');
    expect(getHostFrame()).toBe(0);
    expect(getNetMode()).toBe('off');
  });
});
