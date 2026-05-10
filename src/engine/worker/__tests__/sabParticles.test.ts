import { describe, it, expect } from 'vitest';
import {
  makeViews, writeParticles, readParticles,
  ColorCache, SAB_PARTICLES_BYTES, SAB_PARTICLE_MAX,
} from '../sabParticles';
import type { Particle } from '../../types';

function mkParticle(overrides: Partial<Particle> = {}): Particle {
  return {
    x: 100, y: 200, vx: 1.5, vy: -2.25,
    life: 0.5, maxLife: 1.0, size: 3.5,
    color: '#FF8800', shape: undefined,
    ...overrides,
  };
}

describe('sabParticles', () => {
  it('round-trips a small batch with mixed shapes and colors', () => {
    const sab = new ArrayBuffer(SAB_PARTICLES_BYTES);
    const views = makeViews(sab);
    const colors = new ColorCache();

    const written = [
      mkParticle({ x: 10, y: 20, color: '#FF0000' }),
      mkParticle({ x: 30, y: 40, color: '#00FF00', shape: 'spike' }),
      mkParticle({ x: 50, y: 60, color: '#0000FF' }),
    ];

    writeParticles(views, written);
    const pool: Particle[] = [];
    const n = readParticles(views, pool, colors);

    expect(n).toBe(3);
    expect(pool[0].x).toBe(10);
    expect(pool[0].y).toBe(20);
    expect(pool[0].color).toBe('rgb(255,0,0)');
    expect(pool[0].shape).toBe('circle');
    expect(pool[1].color).toBe('rgb(0,255,0)');
    expect(pool[1].shape).toBe('spike');
    expect(pool[2].color).toBe('rgb(0,0,255)');
    expect(pool[2].shape).toBe('circle');
  });

  it('preserves all float fields with Float32 precision', () => {
    const views = makeViews(new ArrayBuffer(SAB_PARTICLES_BYTES));
    const p = mkParticle({ x: 1.5, y: -2.25, vx: 100.125, vy: -50.0625, life: 0.5, maxLife: 1.0, size: 7.5 });
    writeParticles(views, [p]);

    const pool: Particle[] = [];
    readParticles(views, pool, new ColorCache());
    expect(pool[0].x).toBe(1.5);
    expect(pool[0].y).toBe(-2.25);
    expect(pool[0].vx).toBe(100.125);
    expect(pool[0].vy).toBe(-50.0625);
    expect(pool[0].life).toBe(0.5);
    expect(pool[0].maxLife).toBe(1.0);
    expect(pool[0].size).toBe(7.5);
  });

  it('caps writes at SAB_PARTICLE_MAX even when given a larger array', () => {
    const views = makeViews(new ArrayBuffer(SAB_PARTICLES_BYTES));
    const big: Particle[] = [];
    for (let i = 0; i < SAB_PARTICLE_MAX + 50; i++) big.push(mkParticle({ x: i }));
    writeParticles(views, big);

    const pool: Particle[] = [];
    const n = readParticles(views, pool, new ColorCache());
    expect(n).toBe(SAB_PARTICLE_MAX);
  });

  it('reuses pool slots across reads — same object identity', () => {
    const views = makeViews(new ArrayBuffer(SAB_PARTICLES_BYTES));
    const colors = new ColorCache();
    const pool: Particle[] = [];

    writeParticles(views, [mkParticle({ x: 1 }), mkParticle({ x: 2 })]);
    readParticles(views, pool, colors);
    const objA = pool[0];
    const objB = pool[1];

    writeParticles(views, [mkParticle({ x: 99 }), mkParticle({ x: 100 })]);
    readParticles(views, pool, colors);

    expect(pool[0]).toBe(objA);
    expect(pool[1]).toBe(objB);
    expect(pool[0].x).toBe(99);
  });

  it('shrinks live count via header — old slots not iterated', () => {
    const views = makeViews(new ArrayBuffer(SAB_PARTICLES_BYTES));
    writeParticles(views, [mkParticle({ x: 10 }), mkParticle({ x: 20 }), mkParticle({ x: 30 })]);
    const pool: Particle[] = [];
    readParticles(views, pool, new ColorCache());

    writeParticles(views, [mkParticle({ x: 99 })]);
    const n2 = readParticles(views, pool, new ColorCache());
    expect(n2).toBe(1);
    // pool[1] / pool[2] still hold the slot objects but the renderer
    // would slice to n2 — only pool[0..0] is logically live.
  });

  it('color cache reuses string instances across calls', () => {
    const colors = new ColorCache();
    const s1 = colors.get(0x00ff0000);
    const s2 = colors.get(0x01ff0000); // shape bit set, same color
    expect(s1).toBe(s2); // same string instance from the cache
    expect(s1).toBe('rgb(255,0,0)');
  });

  it('defensive: non-hex color packs as magenta sentinel', () => {
    const views = makeViews(new ArrayBuffer(SAB_PARTICLES_BYTES));
    writeParticles(views, [mkParticle({ color: 'rgb(1,2,3)' })]);
    const pool: Particle[] = [];
    readParticles(views, pool, new ColorCache());
    expect(pool[0].color).toBe('rgb(255,0,255)');
  });
});
