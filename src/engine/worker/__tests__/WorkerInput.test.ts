// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { WorkerInput } from '../WorkerInput';
import { applyInputBatchTo } from '../inputBatch';
import { writeSlotInput, SAB_INPUT_BYTES } from '../sabInput';
import { Simulator } from '../../simulator/Simulator';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { makeArena, makeSettings } from '../../__tests__/testHelpers';
import { CapturedEvents } from '../../__tests__/helpers/eventSink';
import { FIXED_TIMESTEP } from '../../constants';
import type { InputState, MatchState, PlayerSlot } from '../../types';

const state = {} as MatchState;
const neutral: InputState = { left: false, right: false, jump: false, down: false };
beforeAll(() => { registerBuiltinArenas(); registerBuiltinCharacters(); });

describe('worker-only asynchronous input', () => {
  it('consumes a message jump once across multiple catch-up ticks', () => {
    const map = new Map<PlayerSlot, InputState>();
    const input = new WorkerInput('P1', map);
    applyInputBatchTo(map, [['P1', { ...neutral, jump: true }]]);
    applyInputBatchTo(map, [['P1', { ...neutral, right: true }]]);
    expect(input.getAction(state)).toEqual({ ...neutral, jump: true, right: true });
    expect(input.getAction(state)).toEqual({ ...neutral, right: true });
    expect(input.getAction(state)).toEqual({ ...neutral, right: true });
  });

  it('consumes a shared-memory jump once while preserving held levels', () => {
    const view = new Int32Array(new SharedArrayBuffer(SAB_INPUT_BYTES));
    const input = new WorkerInput('P1', new Map(), view, 0);
    writeSlotInput(view, 0, { ...neutral, jump: true });
    writeSlotInput(view, 0, { ...neutral, right: true });
    expect(input.getAction(state)).toEqual({ ...neutral, jump: true, right: true });
    expect(input.getAction(state)).toEqual({ ...neutral, right: true });
  });

  it('ignores raw local shared memory when online authority owns the batch', () => {
    const view = new Int32Array(new SharedArrayBuffer(SAB_INPUT_BYTES));
    writeSlotInput(view, 0, { ...neutral, right: true, jump: true });
    const map = new Map<PlayerSlot, InputState>();
    applyInputBatchTo(map, [['P3', { ...neutral, left: true, jump: true }]]);
    const input = new WorkerInput('P3', map, view, 0, () => false);
    expect(input.getAction(state)).toEqual({ ...neutral, left: true, jump: true });
    expect(input.getAction(state)).toEqual({ ...neutral, left: true });
  });

  for (const mode of ['messages', 'sab']) {
    it('retains a jump across hitstop until the simulator reads the player (' + mode + ')', () => {
      const map = new Map<PlayerSlot, InputState>();
      const view = mode === 'sab' ? new Int32Array(new SharedArrayBuffer(SAB_INPUT_BYTES)) : null;
      const sim = new Simulator({
        arena: makeArena(), settings: makeSettings(), activePlayers: ['P1'], events: new CapturedEvents(),
      });
      sim.getState().phase = 'playing';
      sim.getState().countdown = 0;
      const player = sim.getState().players[0];
      player.state = 'idle'; player.y = 660 - player.height; player.hitstopTimer = FIXED_TIMESTEP * 3;
      sim.setPlayerInput('P1', new WorkerInput('P1', map, view, 0));
      if (view) {
        writeSlotInput(view, 0, { ...neutral, jump: true });
        writeSlotInput(view, 0, neutral);
      } else {
        applyInputBatchTo(map, [['P1', { ...neutral, jump: true }]]);
        applyInputBatchTo(map, [['P1', neutral]]);
      }
      sim.fixedUpdate(FIXED_TIMESTEP);
      expect(player.vy).toBe(0);
      player.hitstopTimer = 0;
      sim.fixedUpdate(FIXED_TIMESTEP);
      expect(player.vy).toBeLessThan(0);
      // Force grounded next tick: stale jump must not launch a second time.
      player.state = 'idle'; player.vy = 0; player.y = 660 - player.height;
      sim.fixedUpdate(FIXED_TIMESTEP);
      expect(player.vy).toBe(0);
    });
  }
});
