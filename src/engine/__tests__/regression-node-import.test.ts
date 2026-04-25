// src/engine/__tests__/regression-node-import.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';

describe('regression: pure modules import in Node env without DOM', () => {
  it('physics is importable', async () => {
    const mod = await import('../physics');
    expect(typeof mod.applyInput).toBe('function');
  });

  it('stomp is importable', async () => {
    const mod = await import('../stomp');
    expect(mod).toBeDefined();
  });

  it('hazardCollision is importable', async () => {
    const mod = await import('../hazardCollision');
    expect(mod).toBeDefined();
  });

  it('constants is importable', async () => {
    const mod = await import('../constants');
    expect(typeof mod.FIXED_TIMESTEP).toBe('number');
  });

  it('types module side-effect free', async () => {
    const mod = await import('../types');
    expect(typeof mod.isBotSlot).toBe('function');
  });

  it('ai modules importable', async () => {
    const mod = await import('../ai');
    expect(mod).toBeDefined();
  });

  it('net/prng is importable', async () => {
    const mod = await import('../net/prng');
    expect(mod.SeededRNG).toBeDefined();
  });
});
