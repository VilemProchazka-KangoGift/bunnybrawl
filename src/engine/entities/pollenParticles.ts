import type { MatchState } from '../types';
import type { EntityKind } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { updatePollen } from '../gameLoop/cosmetics/environment';
import { hexToRGB } from '../fastMath';
import { getSlowDevice } from '../perfFlags';
import { randRange } from '../themes/utils';

export type PollenParticle = MatchState['pollenParticles'][number];

interface AmbientColorCache {
  themeAmbient: unknown;
  strings: string[];
}
let _cache: AmbientColorCache | null = null;

/** Drawn inline in `renderer.ts` (after ghosts); dispatched directly,
 *  not via `getEntitiesForLayer`. */
export const pollenParticlesEntity: EntityKind<PollenParticle> = {
  id: 'pollenParticles',
  mirror: 'none',

  init({ theme }) {
    const ac = theme.ambientParticles;
    const out: PollenParticle[] = [];
    for (let i = 0; i < ac.count; i++) {
      out.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        vx: randRange(ac.vxRange),
        vy: randRange(ac.vyRange),
        size: randRange(ac.sizeRange),
        alpha: randRange(ac.alphaRange),
      });
    }
    return out;
  },

  cosmeticStep(_state, { dt, state: matchState }) {
    if (getSlowDevice()) return;
    updatePollen(matchState, dt);
  },

  draw(ctx, state, { theme }) {
    if (getSlowDevice() || state.length === 0) return;
    const ambCfg = theme.ambientParticles;
    if (!_cache || _cache.themeAmbient !== ambCfg) {
      const rgbs = ambCfg.colors.map(hexToRGB);
      _cache = {
        themeAmbient: ambCfg,
        strings: rgbs.map(c => `rgb(${c.r},${c.g},${c.b})`),
      };
    }
    const colorStrings = _cache.strings;
    const hasTwoColors = colorStrings.length > 1;
    ctx.save();
    let lastCi = -1;
    for (const pp of state) {
      const ci = pp.size > 2 ? 0 : (hasTwoColors ? 1 : 0);
      if (ci !== lastCi) {
        ctx.fillStyle = colorStrings[ci];
        lastCi = ci;
      }
      ctx.globalAlpha = pp.alpha * 0.7;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, pp.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
};
