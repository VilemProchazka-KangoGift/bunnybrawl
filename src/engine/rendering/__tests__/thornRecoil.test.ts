import { describe, it, expect } from 'vitest';
import { ThornRecoil } from '../thornRecoil';
import { makePlayer } from '../../__tests__/testHelpers';
import type { Particle } from '../../types';
const thorns = [{x:116,y:116,vx:0,vy:0,life:.48,maxLife:.48,size:22,color:'#FFF0CB',shape:'thornJolt'}] as Particle[];
describe('thorn pain jolt',()=>{
 it('recoils against travel, settles, and never changes physical coordinates',()=>{
  const p=makePlayer({x:100,y:100,vx:100,slowTimer:5});const fx=new ThornRecoil();
  expect(fx.sample(p,thorns,0)).toBe(0);
  expect(fx.sample(p,thorns,100)).toBeCloseTo(-.75);
  expect(fx.sample(p,thorns,400)).toBe(0);
  expect(fx.sample(p,thorns,500)).toBe(0);
  expect([p.x,p.y,p.vx]).toEqual([100,100,100]);
  p.slowTimer=4;fx.sample(p,thorns,600);p.slowTimer=5;fx.sample(p,thorns,620);
  expect(fx.sample(p,thorns,720)).toBeCloseTo(-.75);
 });
 it('ignores other slow sources and clears death/respawn',()=>{
  const p=makePlayer({x:400,y:100,slowTimer:5});const fx=new ThornRecoil();
  fx.sample(p,thorns,0);expect(fx.sample(p,thorns,100)).toBe(0);
  p.x=100;p.slowTimer=0;fx.sample(p,thorns,200);p.slowTimer=5;fx.sample(p,thorns,220);
  p.state='respawning';expect(fx.sample(p,thorns,250)).toBe(0);
 });
});
