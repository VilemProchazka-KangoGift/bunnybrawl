// src/engine/net/netSimFlags.ts
//
// Three numeric emitters that feed the `NetworkSimulator` config in
// `transport.ts`. Default to 0 (no simulated adversity). Read once at
// transport construction — changes take effect on next page load / next
// `Transport` instantiation.
//
// URL: ?simLatency=80&simJitter=20&simLoss=5
// Storage: carrotroyale_sim_latency / _sim_jitter / _sim_loss

import { createUrlStoredEmitter } from '../urlStoredEmitter';

function parseNonNegInt(raw: string): number | null {
  const v = Number.parseInt(raw, 10);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

function parseNonNegFloat(raw: string): number | null {
  const v = Number.parseFloat(raw);
  if (!Number.isFinite(v) || v < 0) return null;
  // Loss is a percentage 0..100 — clamp the upper bound.
  return Math.min(v, 100);
}

const latency = createUrlStoredEmitter<number>({
  storageKey: 'carrotroyale_sim_latency',
  paramName: 'simLatency',
  defaultValue: 0,
  parse: parseNonNegInt,
  serialize: (v) => String(v),
});

const jitter = createUrlStoredEmitter<number>({
  storageKey: 'carrotroyale_sim_jitter',
  paramName: 'simJitter',
  defaultValue: 0,
  parse: parseNonNegInt,
  serialize: (v) => String(v),
});

const loss = createUrlStoredEmitter<number>({
  storageKey: 'carrotroyale_sim_loss',
  paramName: 'simLoss',
  defaultValue: 0,
  parse: parseNonNegFloat,
  serialize: (v) => String(v),
});

export const getSimLatency = latency.get;
export const getSimJitter = jitter.get;
export const getSimLoss = loss.get;

export const subscribeSimLatency = latency.subscribe;
export const subscribeSimJitter = jitter.subscribe;
export const subscribeSimLoss = loss.subscribe;

export const setSimLatency = latency.set;
export const setSimJitter = jitter.set;
export const setSimLoss = loss.set;

export function initNetSimFlags(searchString: string): void {
  latency.init(searchString);
  jitter.init(searchString);
  loss.init(searchString);
}
