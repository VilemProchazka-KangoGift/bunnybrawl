import { describe, expect, it } from 'vitest';
import { InputProbe } from '../inputProbe';

describe('read-only perf input probe', () => {
  it('waits for the requested slot and level, then reports one render', () => {
    const probe = new InputProbe();
    probe.arm({ id: 1, slot: 'P1', button: 'right', pressed: true });
    const input = { left: false, right: false, jump: false, down: false };
    probe.observe('P1', input, 10);
    probe.observe('P2', { ...input, right: true }, 11);
    expect(probe.rendered(12)).toBeNull();
    probe.observe('P1', { ...input, right: true }, 13);
    probe.observe('P1', { ...input, right: true }, 14);
    expect(probe.rendered(15)).toEqual({ id: 1, consumedAt: 13, renderedAt: 15 });
    expect(probe.rendered(16)).toBeNull();
  });
  it('clears an unfinished probe at teardown', () => {
    const probe = new InputProbe();
    probe.arm({ id: 1, slot: 'P1', button: 'jump', pressed: true });
    probe.observe('P1', { left: false, right: false, jump: true, down: false }, 10);
    probe.clear();
    expect(probe.rendered(11)).toBeNull();
  });
});
