// src/engine/headless/policy.ts
//
// Batched-inference policy infrastructure for ML self-play.
//
// A neural-net policy is the bottleneck in an ML training loop. Calling its
// forward pass once per slot per tick is wasteful when the same network can
// produce all 2-5 slot actions in a single batched forward pass. The pieces:
//
//   BatchedPolicy  — interface implemented by the underlying inference engine
//                    (rule-based stub, ONNX, transformer.js, etc.)
//   PolicyBroker   — orchestrator: extracts observations into a flat buffer,
//                    invokes BatchedPolicy.step once per tick, exposes per-slot
//                    actions to the simulator
//   PolicyInput    — per-slot PlayerInput adapter; getAction reads the broker's
//                    pre-computed action (no inference inside getAction)
//
// Tick contract:
//   1. Caller (HeadlessRunner) calls broker.tick(state, arena) BEFORE the
//      simulator's per-slot input dispatch.
//   2. broker fills its observation buffer + invokes policy.step.
//   3. Simulator iterates players, calls each PolicyInput.getAction(state),
//      which returns the broker's stored action for that slot.

import type { Arena, InputState, MatchState, PlayerSlot } from '../types';
import type { PlayerInput } from '../input/PlayerInput';
import { extractObservation, OBSERVATION_SIZE } from './observation';

/**
 * Implemented by the underlying inference engine. step() reads observations
 * for `slots` from `obsBuffer` (row-major: slot i lives at
 * `obsBuffer.subarray(i*OBSERVATION_SIZE, (i+1)*OBSERVATION_SIZE)`) and writes
 * per-slot input into `actionBuffer[i]` (mutate the existing object — no
 * reallocation per tick).
 *
 * Sync impls (rule-based stubs, native code) execute inference inline. Async
 * impls (transformer.js, ONNX) must guarantee step() completes within the tick
 * budget; the typical pattern is to fire-and-forget the next-tick prediction
 * during step() and read the previous tick's result from the cache.
 */
export interface BatchedPolicy {
  step(
    slots: ReadonlyArray<PlayerSlot>,
    obsBuffer: Float32Array,
    actionBuffer: InputState[],
  ): void;
}

const ALL_FALSE: Readonly<InputState> = { left: false, right: false, jump: false, down: false };

const INITIAL_CAPACITY = 4;

/**
 * Orchestrator for one BatchedPolicy serving multiple slots in lockstep.
 *
 * Lifecycle:
 *   const broker = new PolicyBroker(myPolicy);
 *   const piP1 = broker.register('P1');
 *   const piP2 = broker.register('P2');
 *   simulator.setPlayerInput('P1', piP1);
 *   simulator.setPlayerInput('P2', piP2);
 *   // Per tick:
 *   broker.tick(simulator.getState(), simulator.getArena());
 *   simulator.fixedUpdate(dt);  // PolicyInput.getAction now reads broker's actions
 */
export class PolicyBroker {
  private readonly _policy: BatchedPolicy;
  private readonly _slots: PlayerSlot[] = [];
  private readonly _actions: InputState[] = [];
  private readonly _actionBySlot: Map<PlayerSlot, InputState> = new Map();
  private _obsBuffer: Float32Array;
  private _capacity: number;

  constructor(policy: BatchedPolicy) {
    this._policy = policy;
    this._capacity = INITIAL_CAPACITY;
    this._obsBuffer = new Float32Array(this._capacity * OBSERVATION_SIZE);
  }

  /**
   * Register a slot. Idempotent — returns a fresh PolicyInput each call but
   * the slot only joins the batch once.
   */
  register(slot: PlayerSlot): PolicyInput {
    if (!this._actionBySlot.has(slot)) {
      this._slots.push(slot);
      const action: InputState = { ...ALL_FALSE };
      this._actions.push(action);
      this._actionBySlot.set(slot, action);
      this._growIfNeeded();
    }
    return new PolicyInput(slot, this);
  }

  /** Stop including `slot` in batches. PolicyInput instances become stale (return all-false). */
  unregister(slot: PlayerSlot): void {
    const idx = this._slots.indexOf(slot);
    if (idx === -1) return;
    this._slots.splice(idx, 1);
    this._actions.splice(idx, 1);
    this._actionBySlot.delete(slot);
  }

  /** Run one batched forward pass. Call BEFORE the per-slot fixedUpdate iteration. */
  tick(state: Readonly<MatchState>, arena: Readonly<Arena>): void {
    if (this._slots.length === 0) return;
    for (let i = 0; i < this._slots.length; i++) {
      const sub = this._obsBuffer.subarray(i * OBSERVATION_SIZE, (i + 1) * OBSERVATION_SIZE);
      extractObservation(state, this._slots[i], arena, sub);
    }
    this._policy.step(this._slots, this._obsBuffer, this._actions);
  }

  /** Read the most recent action for `slot`. Returns all-false if slot wasn't registered or never ticked. */
  getAction(slot: PlayerSlot): Readonly<InputState> {
    return this._actionBySlot.get(slot) ?? ALL_FALSE;
  }

  /** Number of slots currently registered. */
  size(): number {
    return this._slots.length;
  }

  /** Current observation buffer capacity in floats. Exposed for diagnostics. */
  getBufferCapacity(): number {
    return this._obsBuffer.length;
  }

  private _growIfNeeded(): void {
    if (this._slots.length <= this._capacity) return;
    while (this._slots.length > this._capacity) this._capacity *= 2;
    this._obsBuffer = new Float32Array(this._capacity * OBSERVATION_SIZE);
  }
}

/**
 * Per-slot PlayerInput adapter. getAction(state) returns the broker's
 * pre-computed action — does NOT trigger inference.
 */
export class PolicyInput implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly _broker: PolicyBroker;

  constructor(slot: PlayerSlot, broker: PolicyBroker) {
    this.slot = slot;
    this._broker = broker;
  }

  getAction(_state: Readonly<MatchState>): InputState {
    // Spread to defeat readonly-ness for callers that expect a mutable shape.
    // Allocation is tolerable here — caller is the simulator's per-player loop,
    // 4-5 calls per tick at 60Hz.
    return { ...this._broker.getAction(this.slot) };
  }
}
