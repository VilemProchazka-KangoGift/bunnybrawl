import { describe, it, expect, vi } from 'vitest';
import { updatePlayerCosmetics } from '../../gameLoop/cosmetics/playerCosmetics';
import { makePlayer } from '../../__tests__/testHelpers';
import { Accumulator } from '../../accumulator';
import { drawParticles } from '../particles';
import { createMockCanvasCtx } from '../../__tests__/mockCanvas';
import type { Arena, Particle } from '../../types';
vi.mock('../../audio', () => ({ audio: { setVolume: vi.fn() } }));
vi.mock('../../perfFlags', () => ({ getSlowDevice: () => false }));
describe('tiny heel puffs', () => {
  it('emits five clouds per second while preserving faster footstep audio; clears on stop', () => {
    const p = makePlayer({ state: 'run', vx: 280, facing: 'right' });
    const echoes = new Accumulator(), footsteps = new Accumulator(), heels = new Accumulator();
    const emit = vi.fn(), sound = vi.fn(), arena = { platforms: [], surface: 'grass' } as unknown as Arena;
    const tick = (dt: number) => updatePlayerCosmetics(p, dt, 280, echoes, footsteps, emit, sound, arena, false, heels);
    for(let i=0;i<10;i++)tick(.1);
    expect(emit).toHaveBeenCalledTimes(5);expect(sound.mock.calls.length).toBeGreaterThan(5);
    expect(emit.mock.calls[0]).toEqual([p.x+p.width*.2,p.y+p.height-1,-9,-4,.3,2.8,'#FFF0DB','heelCloud']);
    p.state='idle';tick(.1);p.state='run';tick(.1);expect(emit).toHaveBeenCalledTimes(5);
    p.facing='left';tick(.1);expect(emit.mock.lastCall?.[2]).toBe(9);
  });
  it('draws a small irregular cloud instead of a dot after worker color decoding', () => {
    const ctx=createMockCanvasCtx();
    drawParticles(ctx,[{x:10,y:20,vx:-9,vy:-4,life:.2,maxLife:.3,size:2.8,color:'rgb(255,240,219)',shape:'heelCloud'} as Particle]);
    expect(ctx.bezierCurveTo).toHaveBeenCalledTimes(3);expect(ctx.arc).not.toHaveBeenCalled();
  });
});
