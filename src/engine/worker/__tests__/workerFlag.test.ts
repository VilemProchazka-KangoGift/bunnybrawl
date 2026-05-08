/**
 * workerFlag URL + localStorage handling. Default ON; ?worker=off and the
 * stored preference both flip to OFF.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function reload<T extends object>(modPath: string): Promise<T> {
  vi.resetModules();
  return import(modPath) as Promise<T>;
}

const stubLocation = (search: string): void => {
  vi.stubGlobal('window', {
    location: { search } as unknown as Location,
  });
};

beforeEach(() => {
  vi.unstubAllGlobals();
  globalThis.localStorage?.clear?.();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workerFlag', () => {
  it('defaults to enabled when no URL param and no storage', async () => {
    stubLocation('');
    const mod = await reload<typeof import('../workerFlag')>('../workerFlag');
    expect(mod.isWorkerEnabled()).toBe(true);
  });

  it('?worker=off forces disabled', async () => {
    stubLocation('?worker=off');
    const mod = await reload<typeof import('../workerFlag')>('../workerFlag');
    expect(mod.isWorkerEnabled()).toBe(false);
  });

  it('?worker=on forces enabled', async () => {
    stubLocation('?worker=on');
    const mod = await reload<typeof import('../workerFlag')>('../workerFlag');
    expect(mod.isWorkerEnabled()).toBe(true);
  });

  it('setWorkerEnabled persists and notifies subscribers', async () => {
    stubLocation('');
    const mod = await reload<typeof import('../workerFlag')>('../workerFlag');
    let calls = 0;
    mod.subscribeWorkerFlag(() => { calls++; });
    mod.setWorkerEnabled(false);
    expect(calls).toBe(1);
    expect(mod.isWorkerEnabled()).toBe(false);
    mod.setWorkerEnabled(false); // no-op when unchanged
    expect(calls).toBe(1);
  });
});
