// src/engine/__tests__/wildlifeSystem.test.ts
//
// Smoke tests for WildlifeSystem + buildGroundCritter factory. The full
// per-pack tick + rendering pipeline is covered by the existing arena
// regression suites; these tests pin the system-level contract.

import { describe, it, expect, vi } from 'vitest';
import { WildlifeSystem } from '../gameLoop/cosmetics/WildlifeSystem';
import {
  buildGroundCritter,
  registerWildlifeKind,
  createWildlifeInstance,
  getWildlifeKind,
  type WildlifeInstance,
} from '../gameLoop/cosmetics/wildlife';
import { makeArena, makeState, makePlayer } from './testHelpers';

vi.mock('../perfFlags', () => ({ getSlowDevice: () => false }));

describe('WildlifeSystem', () => {
  it('buckets instances by render layer', () => {
    const state = makeState({ phase: 'playing' });
    const sys = new WildlifeSystem(state, makeArena());
    const groundInst = buildGroundCritter({
      seed: 0,
      cfg: { platL: 100, platR: 300, platTopY: 660, walkSpeed: 30, fleeSpeed: 90, fleeRadius: 80 },
      draw: () => {},
    });
    const animBgInst = buildGroundCritter({
      seed: 1,
      cfg: { platL: 100, platR: 300, platTopY: 660, walkSpeed: 30, fleeSpeed: 90, fleeRadius: 80 },
      layer: 'animBackground',
      draw: () => {},
    });
    sys.setInstances([groundInst, animBgInst]);
    expect(sys.getInstancesForLayer('groundCritter')).toHaveLength(1);
    expect(sys.getInstancesForLayer('animBackground')).toHaveLength(1);
  });

  it('drops instances with unknown kindId and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = makeState({ phase: 'playing' });
    const sys = new WildlifeSystem(state, makeArena());
    const bogus = createWildlifeInstance({
      kindId: 'wildlife.does-not-exist',
      seed: 0,
      home: { x: 0, y: 0 },
      data: {},
    });
    sys.setInstances([bogus]);
    expect(sys.getInstancesForLayer('groundCritter')).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('does-not-exist'));
    warn.mockRestore();
  });

  it('cosmeticUpdate ticks groundCritter state', () => {
    const player = makePlayer({ id: 'P1', x: 200, y: 620, width: 28, height: 40 });
    const state = makeState({ phase: 'playing', players: [player] });
    const sys = new WildlifeSystem(state, makeArena());
    const inst = buildGroundCritter({
      seed: 0,
      cfg: { platL: 100, platR: 300, platTopY: 660, walkSpeed: 30, fleeSpeed: 90, fleeRadius: 80 },
      initialX: 150,
      initialDir: 1,
      draw: () => {},
    });
    sys.setInstances([inst]);
    const startX = inst.data.state.x;
    for (let i = 0; i < 30; i++) sys.cosmeticUpdate(1 / 30);
    // Critter should have moved (walking + flee from player).
    expect(inst.data.state.x).not.toBe(startX);
  });

  it('cosmeticUpdate skips work while phase=loading', () => {
    const player = makePlayer({ id: 'P1', x: 200, y: 620, width: 28, height: 40 });
    const state = makeState({ phase: 'loading', players: [player] });
    const sys = new WildlifeSystem(state, makeArena());
    const inst = buildGroundCritter({
      seed: 0,
      cfg: { platL: 100, platR: 300, platTopY: 660, walkSpeed: 30, fleeSpeed: 90, fleeRadius: 80 },
      initialX: 150,
      draw: () => {},
    });
    sys.setInstances([inst]);
    const startX = inst.data.state.x;
    for (let i = 0; i < 30; i++) sys.cosmeticUpdate(1 / 30);
    expect(inst.data.state.x).toBe(startX);
  });

  it('resetBaseline resets per-instance runtime state', () => {
    const state = makeState({ phase: 'playing' });
    const sys = new WildlifeSystem(state, makeArena());
    const inst = buildGroundCritter({
      seed: 0,
      cfg: { platL: 100, platR: 300, platTopY: 660, walkSpeed: 30, fleeSpeed: 90, fleeRadius: 80 },
      draw: () => {},
    });
    sys.setInstances([inst]);
    inst.data.state.x = 999;
    inst.data.state.fleeing = true;
    inst.data.state.facingEase = -1;
    sys.resetBaseline();
    expect(inst.data.state.x).toBe(200); // (100 + 300) / 2
    expect(inst.data.state.fleeing).toBe(false);
    expect(inst.data.state.facingEase).toBe(1);
  });

  it('cleanup empties all layer buckets', () => {
    const state = makeState({ phase: 'playing' });
    const sys = new WildlifeSystem(state, makeArena());
    const inst = buildGroundCritter({
      seed: 0,
      cfg: { platL: 100, platR: 300, platTopY: 660, walkSpeed: 30, fleeSpeed: 90, fleeRadius: 80 },
      draw: () => {},
    });
    sys.setInstances([inst]);
    sys.cleanup();
    expect(sys.getInstancesForLayer('groundCritter')).toHaveLength(0);
    expect(sys.getInstancesForLayer('animBackground')).toHaveLength(0);
  });

  it('setInstances replaces (not appends) bucket contents', () => {
    const state = makeState({ phase: 'playing' });
    const sys = new WildlifeSystem(state, makeArena());
    const a = buildGroundCritter({
      seed: 0,
      cfg: { platL: 100, platR: 300, platTopY: 660, walkSpeed: 30, fleeSpeed: 90, fleeRadius: 80 },
      draw: () => {},
    });
    const b = buildGroundCritter({
      seed: 1,
      cfg: { platL: 400, platR: 600, platTopY: 660, walkSpeed: 30, fleeSpeed: 90, fleeRadius: 80 },
      draw: () => {},
    });
    sys.setInstances([a]);
    sys.setInstances([b]);
    const ground = sys.getInstancesForLayer('groundCritter');
    expect(ground).toHaveLength(1);
    expect(ground[0].seed).toBe(1);
  });

  it('custom kind tick + draw runs through the system', () => {
    const tick = vi.fn();
    const draw = vi.fn();
    registerWildlifeKind('wildlife.test-custom', {
      layer: 'groundCritter',
      tick,
      draw,
    });
    const state = makeState({ phase: 'playing' });
    const sys = new WildlifeSystem(state, makeArena());
    const inst: WildlifeInstance<{ count: number }> = createWildlifeInstance({
      kindId: 'wildlife.test-custom',
      seed: 0,
      home: { x: 0, y: 0 },
      data: { count: 0 },
    });
    sys.setInstances([inst]);
    sys.cosmeticUpdate(1 / 30);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('groundCritter data.draw receives the latest state from tickGroundCritter', () => {
    let capturedX = 0;
    const player = makePlayer({ id: 'P1', x: 250, y: 620, width: 28, height: 40 });
    const state = makeState({ phase: 'playing', players: [player] });
    const sys = new WildlifeSystem(state, makeArena());
    const inst = buildGroundCritter({
      seed: 0,
      cfg: { platL: 100, platR: 300, platTopY: 660, walkSpeed: 30, fleeSpeed: 90, fleeRadius: 80 },
      initialX: 150,
      draw: ({ state: critterState }) => {
        capturedX = critterState.x;
      },
    });
    sys.setInstances([inst]);
    // Tick the system so the state moves.
    for (let i = 0; i < 5; i++) sys.cosmeticUpdate(1 / 30);
    // Now read via the registered kind's draw — exercise the captured-x path.
    const cfg = getWildlifeKind(inst.kindId);
    cfg!.draw(({} as unknown as CanvasRenderingContext2D), inst, 0, state);
    expect(capturedX).toBeCloseTo(inst.data.state.x);
  });
});
