/**
 * Worker-only stub for `engine/haptics`. The Vibration API is main-thread
 * only (DOM context), so haptic requests inside the worker post events to
 * main where the real haptics module dispatches.
 *
 * `isLocal` returns true unconditionally so the GameLoop callback always
 * fires haptics.landing/hitstop here; the slot is forwarded over the wire
 * and re-gated against the real `localSlot` on main. Without that re-gate
 * the haptic would either fire for every player or never fire at all.
 *
 * The wire shape comes from `messages.ts > WorkerEngineEventMsg` so any
 * change to the union ripples here at compile time.
 */
import type { PlayerSlot } from '../../types';
import type { WorkerEngineEventMsg } from '../messages';

type EngineHapticEvent = Extract<WorkerEngineEventMsg, { kind: 'haptic' }>;

declare const self: DedicatedWorkerGlobalScope;

function post(ev: EngineHapticEvent): void {
  self.postMessage(ev);
}

export const haptics = {
  init(_slot: PlayerSlot): void { /* tracked on main */ },
  isLocal(_slot: PlayerSlot): boolean { return true; },  // worker doesn't gate; main filters
  landing(prevVy: number, slot?: PlayerSlot): void {
    post({ type: 'worker:engineEvent', kind: 'haptic', flavor: 'landing', slot, prevVy });
  },
  hitstop(slot?: PlayerSlot): void {
    post({ type: 'worker:engineEvent', kind: 'haptic', flavor: 'hitstop', slot });
  },
  hazardHit(): void { /* no-op in worker; main fires from its own state if needed */ },
  spring(): void { /* no-op in worker */ },
  bump(): void { /* no-op in worker */ },
  enabled: false,
  localSlot: null as PlayerSlot | null,
};
