// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { PolicyBroker, PolicyInput } from '../policy';
import type { BatchedPolicy } from '../policy';
import { OBSERVATION_SIZE } from '../observation';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { getArena } from '../../arenas';
import { makePlayer, makeState, makeSettings } from '../../__tests__/testHelpers';
import type { InputState, PlayerSlot } from '../../types';

beforeAll(() => {
  registerBuiltinArenas();
  registerBuiltinCharacters();
});

function makeStubPolicy(
  impl?: (slots: ReadonlyArray<PlayerSlot>, obs: Float32Array, actions: InputState[]) => void,
): BatchedPolicy & { step: ReturnType<typeof vi.fn> } {
  const step = vi.fn(
    (slots: ReadonlyArray<PlayerSlot>, obs: Float32Array, actions: InputState[]) => {
      if (impl) impl(slots, obs, actions);
    },
  );
  return { step };
}

function buildState(slots: PlayerSlot[]) {
  const players = slots.map((id, i) => makePlayer({ id, x: 100 + i * 200, y: 400 }));
  return makeState({ players });
}

describe('PolicyBroker', () => {
  it('tick is a no-op when no slots registered', () => {
    const policy = makeStubPolicy();
    const broker = new PolicyBroker(policy);
    const arena = getArena('meadow');
    const state = buildState([]);

    broker.tick(state, arena, makeSettings());

    expect(policy.step).not.toHaveBeenCalled();
  });

  it('register returns a PolicyInput bound to the slot', () => {
    const broker = new PolicyBroker(makeStubPolicy());
    const pi = broker.register('P1');

    expect(pi).toBeInstanceOf(PolicyInput);
    expect(pi.slot).toBe('P1');
  });

  it('single-slot batch — observation buffer first slice is filled, rest zero', () => {
    const policy = makeStubPolicy();
    const broker = new PolicyBroker(policy);
    broker.register('P1');
    const arena = getArena('meadow');
    const state = buildState(['P1']);

    broker.tick(state, arena, makeSettings());

    expect(policy.step).toHaveBeenCalledTimes(1);
    const [slots, obs] = policy.step.mock.calls[0] as [
      ReadonlyArray<PlayerSlot>,
      Float32Array,
      InputState[],
    ];
    expect(slots).toEqual(['P1']);
    expect(obs.length).toBe(4 * OBSERVATION_SIZE); // INITIAL_CAPACITY = 4

    // First slot's observation has non-zero entries (the player exists in state)
    let firstSliceHasData = false;
    for (let i = 0; i < OBSERVATION_SIZE; i++) {
      if (obs[i] !== 0) {
        firstSliceHasData = true;
        break;
      }
    }
    expect(firstSliceHasData).toBe(true);

    // Padding (slots 1, 2, 3) is all zero
    for (let i = OBSERVATION_SIZE; i < obs.length; i++) {
      expect(obs[i]).toBe(0);
    }
  });

  it('stub policy mutates actions and broker forwards them via PolicyInput', () => {
    const policy = makeStubPolicy((_slots, _obs, actions) => {
      actions[0].left = true;
      actions[0].right = false;
      actions[0].jump = true;
      actions[0].down = false;
    });
    const broker = new PolicyBroker(policy);
    const pi = broker.register('P1');
    const arena = getArena('meadow');
    const state = buildState(['P1']);

    broker.tick(state, arena, makeSettings());

    const action = pi.getAction(state);
    expect(action).toEqual({ left: true, right: false, jump: true, down: false });
  });

  it('multi-slot batch — slots passed in registration order, each gets its own action', () => {
    const policy = makeStubPolicy((_slots, _obs, actions) => {
      actions[0].left = true;
      actions[1].right = true;
    });
    const broker = new PolicyBroker(policy);
    const piP1 = broker.register('P1');
    const piP2 = broker.register('P2');
    const arena = getArena('meadow');
    const state = buildState(['P1', 'P2']);

    broker.tick(state, arena, makeSettings());

    expect(policy.step.mock.calls[0][0]).toEqual(['P1', 'P2']);
    expect(piP1.getAction(state)).toEqual({ left: true, right: false, jump: false, down: false });
    expect(piP2.getAction(state)).toEqual({ left: false, right: true, jump: false, down: false });
  });

  it('slot ordering matches registration order, NOT alphabetical', () => {
    const policy = makeStubPolicy();
    const broker = new PolicyBroker(policy);
    broker.register('B1');
    broker.register('P1');
    const arena = getArena('meadow');
    const state = buildState(['B1', 'P1']);

    broker.tick(state, arena, makeSettings());

    expect(policy.step.mock.calls[0][0]).toEqual(['B1', 'P1']);
  });

  it('unregister removes slot from subsequent batches', () => {
    const policy = makeStubPolicy();
    const broker = new PolicyBroker(policy);
    broker.register('P1');
    broker.register('P2');
    broker.unregister('P1');
    const arena = getArena('meadow');
    const state = buildState(['P1', 'P2']);

    broker.tick(state, arena, makeSettings());

    expect(policy.step.mock.calls[0][0]).toEqual(['P2']);
    expect(broker.size()).toBe(1);
  });

  it('register is idempotent — same slot twice yields one batch entry', () => {
    const policy = makeStubPolicy();
    const broker = new PolicyBroker(policy);
    const pi1 = broker.register('P1');
    const pi2 = broker.register('P1');
    const arena = getArena('meadow');
    const state = buildState(['P1']);

    broker.tick(state, arena, makeSettings());

    expect(policy.step.mock.calls[0][0]).toEqual(['P1']);
    expect(broker.size()).toBe(1);
    expect(pi1.slot).toBe('P1');
    expect(pi2.slot).toBe('P1');
    // Both adapters read the same broker action, so they agree
    expect(pi1.getAction(state)).toEqual(pi2.getAction(state));
  });

  it('getAction before first tick returns all-false', () => {
    const broker = new PolicyBroker(makeStubPolicy());
    const pi = broker.register('P1');
    const state = buildState(['P1']);

    expect(pi.getAction(state)).toEqual({ left: false, right: false, jump: false, down: false });
  });

  it('grows observation buffer when more than INITIAL_CAPACITY slots register', () => {
    const policy = makeStubPolicy();
    const broker = new PolicyBroker(policy);
    const slots: PlayerSlot[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
    for (const s of slots) broker.register(s);
    const arena = getArena('meadow');
    const state = buildState(slots);

    expect(broker.size()).toBe(5);
    expect(broker.getBufferCapacity()).toBeGreaterThanOrEqual(5 * OBSERVATION_SIZE);

    broker.tick(state, arena, makeSettings());

    const [batchSlots, obs] = policy.step.mock.calls[0] as [
      ReadonlyArray<PlayerSlot>,
      Float32Array,
      InputState[],
    ];
    expect(batchSlots.length).toBe(5);
    expect(obs.length).toBeGreaterThanOrEqual(5 * OBSERVATION_SIZE);
  });

  it('PolicyInput.getAction does not trigger inference', () => {
    const policy = makeStubPolicy();
    const broker = new PolicyBroker(policy);
    const pi = broker.register('P1');
    const state = buildState(['P1']);

    pi.getAction(state);
    pi.getAction(state);
    pi.getAction(state);

    expect(policy.step).not.toHaveBeenCalled();
  });
});
