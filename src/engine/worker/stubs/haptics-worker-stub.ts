/**
 * Worker-only stub for `engine/haptics`. The Vibration API is main-thread
 * only (DOM context), so haptic requests inside the worker post events to
 * main where the real haptics module dispatches.
 *
 * For local play, the touch slot is the local human player, but in
 * sim-in-worker mode we keep things simple: the worker's
 * Simulator.events.onPlayerLanding / onStompHaptic callbacks fire here,
 * which post to main; main checks `haptics.isLocal` against its mirror.
 */

interface EngineHapticEvent {
  type: 'worker:engineEvent';
  kind: 'haptic';
  flavor: 'landing' | 'hitstop';
  slot?: string;
  prevVy?: number;
}

declare const self: DedicatedWorkerGlobalScope;

function post(ev: EngineHapticEvent): void {
  self.postMessage(ev);
}

export const haptics = {
  init(_slot: string): void { /* tracked on main */ },
  isLocal(_slot: string): boolean { return true; },  // worker doesn't gate; main filters
  landing(prevVy: number): void { post({ type: 'worker:engineEvent', kind: 'haptic', flavor: 'landing', prevVy }); },
  hitstop(): void { post({ type: 'worker:engineEvent', kind: 'haptic', flavor: 'hitstop' }); },
};
