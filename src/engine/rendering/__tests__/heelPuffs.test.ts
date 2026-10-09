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
  it('keeps footstep audio but emits no running heel particles', () => {
    const p = makePlayer({ state: 'run', vx: 280, facing: 'right' });
    const emit = vi.fn(), sound = vi.fn();
    const echoes = new Accumulator(), footsteps = new Accumulator();
    for (let i = 0; i < 10; i++) updatePlayerCosmetics(p, .1, 280, echoes, footsteps,
      emit, sound, { platforms: [], surface: 'grass' } as unknown as Arena, false);
    expect(emit).not.toHaveBeenCalled();
    expect(sound.mock.calls.length).toBeGreaterThan(5);
  });
  it('draws a small irregular cloud instead of a dot after worker color decoding', () => {
    const ctx=createMockCanvasCtx();
    drawParticles(ctx,[{x:10,y:20,vx:-9,vy:-4,life:.2,maxLife:.3,size:2.8,color:'rgb(255,240,219)',shape:'heelCloud'} as Particle]);
    expect(ctx.bezierCurveTo).toHaveBeenCalledTimes(3);expect(ctx.arc).not.toHaveBeenCalled();
  });
});
