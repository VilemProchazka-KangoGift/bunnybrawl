import { describe, it, expect } from 'vitest';
import { CeilingSquash } from '../ceilingSquash';
import { makePlayer } from '../../__tests__/testHelpers';

const platforms = [{ x: 80, y: 60, width: 100, height: 20 }];
describe('ceiling squash', () => {
  it('starts before contact, eases in and releases without changing physics or retriggering', () => {
    const p = makePlayer({ x: 100, y: 86, vy: -200, state: 'airborne' });
    const effect = new CeilingSquash();
    expect(effect.pulse(p, platforms, 1000)).toBe(0);
    expect(effect.pulse(p, platforms, 1030)).toBeCloseTo(.5);
    p.y = 80; p.vy = 0;
    expect(effect.pulse(p, platforms, 1060)).toBe(1);
    expect(effect.pulse(p, platforms, 1170)).toBeCloseTo(.5);
    expect(effect.pulse(p, platforms, 1280)).toBe(0);
    expect(effect.pulse(p, platforms, 1400)).toBe(0);
    expect([p.x, p.y, p.vy]).toEqual([100, 80, 0]);
  });
  it('ignores falling, natural apexes and phantom strips; resets on death and rearms', () => {
    const p = makePlayer({ x: 100, y: 86, vy: 100 });
    const effect = new CeilingSquash();
    effect.pulse(p, platforms, 0); expect(effect.pulse(p, platforms, 60)).toBe(0);
    p.y = 100; p.vy = -100; effect.pulse(p, platforms, 100);
    p.y = 86; effect.pulse(p, platforms, 120);
    expect(effect.pulse(p, platforms, 180)).toBe(1);
    p.state = 'splat'; expect(effect.pulse(p, platforms, 190)).toBe(0);
    p.state = 'airborne'; p.x = 65;
    const inset = [{ ...platforms[0], leftCollisionInset: 30 }];
    effect.pulse(p, inset, 220); expect(effect.pulse(p, inset, 280)).toBe(0);
    p.x = 300; p.vy = 0; expect(effect.pulse(p, platforms, 400)).toBe(0);
  });
});
