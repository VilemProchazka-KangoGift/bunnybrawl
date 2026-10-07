import { describe, it, expect } from 'vitest';
import { spawnJumpDustParticles, spawnDustParticles, updateParticles } from '../../gameLoop/cosmetics/particles';
import { drawParticles } from '../particles';
import { createMockCanvasCtx } from '../../__tests__/mockCanvas';
import type { Player, Particle } from '../../types';
import { updatePlayerCosmetics } from '../../gameLoop/cosmetics/playerCosmetics';
import { makePlayer } from '../../__tests__/testHelpers';
import { Accumulator } from '../../accumulator';

const player = { x: 100, y: 100, width: 32, height: 40 } as Player;

describe('movement cloud lifecycle', () => {
  it.each([
    { fastFalling: false, vy: -500 },
    { fastFalling: true, vy: 600 },
    { fastFalling: true, vy: -700 },
  ])('does not obscure movement with old oval afterimages: %j', motion => {
    const p = makePlayer({ state: 'airborne', invincibleTimer: 0, ...motion });
    p.afterimages.push({ x: 90, y: 390, facing: 'right', alpha: 1 });
    updatePlayerCosmetics(p, 1 / 30, 200, new Accumulator(), new Accumulator(),
      () => {}, () => {}, { platforms: [] } as never, false);
    expect(p.afterimages).toHaveLength(0);
  });
  it('keeps takeoff at its launch surface and renders a cloud after worker-style color decoding', () => {
    const particles: Particle[] = [];
    spawnJumpDustParticles(particles, [], player, 160);
    expect(particles).toHaveLength(1);
    expect(particles[0]).toMatchObject({ shape: 'jumpCloud', x: 116, y: 158 });
    particles[0].color = 'rgb(255,243,213)';
    const ctx = createMockCanvasCtx();
    drawParticles(ctx, particles);
    expect(ctx.bezierCurveTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('sends landing clouds outwards and keeps them anchored instead of falling below the platform', () => {
    const particles: Particle[] = [];
    const free: Particle[] = [];
    spawnDustParticles(particles, free, player, 550, '#000000');
    expect(particles).toHaveLength(4);
    expect(particles.every(p => p.shape === 'landingCloud')).toBe(true);
    expect(particles.filter(p => p.vx < 0)).toHaveLength(2);
    expect(particles.filter(p => p.vx > 0)).toHaveLength(2);
    updateParticles(particles, free, [], false, [], 0.1);
    expect(particles.every(p => p.vy === 0)).toBe(true);
    expect(particles.every(p => p.y >= 138 && p.y <= 139)).toBe(true);
    updateParticles(particles, free, [], false, [], 0.4);
    expect(particles).toHaveLength(0);
    expect(free).toHaveLength(4);
  });

  it('renders and retires a stationary fast-stomp crown on the ground', () => {
    const particles: Particle[] = [], free: Particle[] = [];
    spawnDustParticles(particles, free, player, 800, '#000000', true);
    expect(particles).toHaveLength(1);
    expect(particles[0]).toMatchObject({ shape: 'impactCrown', x: 116, y: 138 });
    updateParticles(particles, free, [], false, [], 0.1);
    expect(particles[0]).toMatchObject({ x: 116, y: 138, vx: 0, vy: 0 });
    const ctx = createMockCanvasCtx();
    drawParticles(ctx, particles);
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(1);
    updateParticles(particles, free, [], false, [], 0.4);
    expect(particles).toHaveLength(0);
    expect(free).toHaveLength(1);
  });

  it('restores ordinary particle fill after a cloud changes canvas paint state', () => {
    const particles: Particle[] = [];
    spawnJumpDustParticles(particles, [], player);
    const dot: Particle = { x: 50, y: 50, vx: 0, vy: 0, life: 1, maxLife: 1, size: 2, color: '#FF0000' };
    const ctx = createMockCanvasCtx();
    drawParticles(ctx, [dot, ...particles, dot]);
    expect(ctx.fillStyle).toBe('#FF0000');
    expect(ctx.globalAlpha).toBe(1);
  });
});
