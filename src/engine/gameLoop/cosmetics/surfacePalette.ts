import type { SurfaceTag } from '../../types';

/**
 * Per-surface visual + audio dispatch table. Single source of truth for:
 *   - footstep SFX name (or null for silent surfaces like ice)
 *   - footstep dust color (single color, used by var-dust puff)
 *   - hard-landing debris colors (pair: alternated across emitted particles)
 *
 * Adding a new surface tag: add an entry here AND the SurfaceTag union in
 * types.ts.
 */
interface SurfaceVisuals {
  footstepSound: string | null;
  dust: string;
  debris: [string, string];
}

export const SURFACE_PALETTE: Record<SurfaceTag, SurfaceVisuals> = {
  grass: { footstepSound: 'footstep_grass', dust: '#A8C878', debris: ['#4A7A30', '#8AB860'] },
  stone: { footstepSound: 'footstep_wood',  dust: '#C0B898', debris: ['#7A7066', '#C0B898'] },
  wood:  { footstepSound: 'footstep_wood',  dust: '#C8AA80', debris: ['#7A4F28', '#C8A278'] },
  snow:  { footstepSound: 'footstep_grass', dust: '#F8FAFF', debris: ['#E8F0FF', '#FFFFFF'] },
  sand:  { footstepSound: 'footstep_grass', dust: '#E8D8A0', debris: ['#A88858', '#E8D8A0'] },
  ice:   { footstepSound: null,             dust: '#D8F0FF', debris: ['#A8C8E0', '#E8F8FF'] },
  metal: { footstepSound: 'footstep_wood',  dust: '#FFE8B0', debris: ['#FFE8B0', '#FFFFFF'] },
  glass: { footstepSound: 'footstep_wood',  dust: '#FFFFFF', debris: ['#C0D8E0', '#FFFFFF'] },
};
