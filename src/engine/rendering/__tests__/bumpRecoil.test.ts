import { describe, it, expect } from 'vitest';
import { BumpRecoil } from '../bumpRecoil';
import { makePlayer } from '../../__tests__/testHelpers';

describe('body bump recoil', () => {
  it('moves both poses away from contact even when facing away, then settles without moving physics', () => {
    const a = makePlayer({ id: 'P1', x: 100, y: 100, sideSquash: .8, facing: 'left' });
    const b = makePlayer({ id: 'P2', x: 126, y: 100, sideSquash: .8, facing: 'right' });
    const players = [a,b], recoil = new BumpRecoil();
    recoil.offset(a, players, 1000); recoil.offset(b, players, 1000);
    expect(recoil.offset(a, players, 1090)).toBe(-4);
    expect(recoil.offset(b, players, 1090)).toBe(4);
    expect(recoil.offset(a, players, 1180)).toBe(0);
    expect(recoil.offset(a, players, 1270)).toBe(0); // held contact doesn't restart
    expect([a.x,b.x]).toEqual([100,126]);
  });
  it('ignores walls, distant bodies, and death; rearms after recovery', () => {
    const a=makePlayer({id:'P1',x:100,y:100,sideSquash:.62});
    const b=makePlayer({id:'P2',x:126,y:100});
    const recoil=new BumpRecoil();
    recoil.offset(a,[a,b],0);expect(recoil.offset(a,[a,b],90)).toBe(0);
    a.sideSquash=1;recoil.offset(a,[a,b],200);
    a.sideSquash=.8;recoil.offset(a,[a,b],220);
    expect(recoil.offset(a,[a,b],310)).toBe(-4);
    a.state='splat';expect(recoil.offset(a,[a,b],320)).toBe(0);
    a.state='idle';b.x=500;recoil.offset(a,[a,b],400);
    expect(recoil.offset(a,[a,b],490)).toBe(0);
  });
});
