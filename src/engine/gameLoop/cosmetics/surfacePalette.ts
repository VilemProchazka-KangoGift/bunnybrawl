import type { SurfaceTag } from '../../types';

/**
 * Per-surface dispatch table for footstep sound + var-dust puff color.
 * Adding a new surface tag: add an entry here AND the SurfaceTag union in
 * types.ts.
 */
interface SurfaceVisuals {
  footstepSound: string | null;
  dust: string;
}

export const SURFACE_PALETTE: Record<SurfaceTag, SurfaceVisuals> = {
  grass: { footstepSound: 'footstep_grass', dust: '#A8C878' },
  stone: { footstepSound: 'footstep_wood',  dust: '#C0B898' },
  wood:  { footstepSound: 'footstep_wood',  dust: '#C8AA80' },
  snow:  { footstepSound: 'footstep_grass', dust: '#F8FAFF' },
  sand:  { footstepSound: 'footstep_grass', dust: '#E8D8A0' },
  ice:   { footstepSound: null,             dust: '#D8F0FF' },
  metal: { footstepSound: 'footstep_wood',  dust: '#FFE8B0' },
  glass: { footstepSound: 'footstep_wood',  dust: '#FFFFFF' },
};
