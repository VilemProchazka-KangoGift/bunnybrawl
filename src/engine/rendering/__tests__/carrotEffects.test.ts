import { describe, it, expect } from 'vitest';
import { ParticleSystem } from '../../gameLoop/cosmetics/ParticleSystem';
import type { MatchState, Arena, MatchSettings } from '../../types';
import type { ThemeConfig } from '../../themes/types';

describe('combined carrot pickup',()=>{
 it('emits eight chips, five leaves and six accents without persistent debris',()=>{
  const state={gibs:[]} as unknown as MatchState;
  const system=new ParticleSystem(state,{} as Arena,{} as ThemeConfig,{} as MatchSettings,new Map());
  system.pickupCarrotVFX(400,500);
  const particles=system.getParticles();
  expect(particles).toHaveLength(19);
  expect(particles.filter(p=>p.shape==='carrotChip')).toHaveLength(8);
  expect(particles.filter(p=>p.shape==='carrotLeaf')).toHaveLength(5);
  expect(particles.filter(p=>p.shape==='spike')).toHaveLength(6);
  expect(particles.every(p=>p.maxLife<=.4)).toBe(true);
  expect(state.gibs).toHaveLength(0);
 });
});
