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
    // Group by colour index (only 0/1 are ever used) then alpha-bucket within
    // each colour: one path + fill per (colour, bucket). Same pattern as the
    // waterfall spray/mist batching. Pollen dots are tiny + sparse so batching
    // does not perceptibly change overlap.
    const maxA = (ambCfg.alphaRange?.[1] ?? 1) * 0.7;
    const POLLEN_BUCKETS = 6;
    const nColors = hasTwoColors ? 2 : 1;
    ctx.save();
    for (let c = 0; c < nColors; c++) {
      ctx.fillStyle = colorStrings[c];
      for (let bkt = 0; bkt < POLLEN_BUCKETS; bkt++) {
        ctx.globalAlpha = (bkt + 0.5) / POLLEN_BUCKETS * maxA;
        ctx.beginPath();
        let any = false;
        for (const pp of state) {
          const ci = pp.size > 2 ? 0 : (hasTwoColors ? 1 : 0);
          if (ci !== c) continue;
          const eff = pp.alpha * 0.7;
          const bucket = maxA > 0 ? Math.min(POLLEN_BUCKETS - 1, Math.floor(eff / maxA * POLLEN_BUCKETS)) : 0;
          if (bucket !== bkt) continue;
          ctx.moveTo(pp.x + pp.size, pp.y);
          ctx.arc(pp.x, pp.y, pp.size, 0, Math.PI * 2);
          any = true;
        }
        if (any) ctx.fill();
      }
    }
    ctx.restore();
  },
};
