import type { MatchState } from '../types';
import type { EntityKind } from './types';
import { CANVAS_WIDTH } from '../constants';
import { updateFog } from '../gameLoop/cosmetics/environment';
import { hexToRGB } from '../fastMath';
import { getSlowDevice } from '../perfFlags';
import { randRange } from '../themes/utils';

export type FogParticle = MatchState['fogParticles'][number];

interface FogColorCache {
  themeFog: unknown;
  rgb: { r: number; g: number; b: number };
}
let _cache: FogColorCache | null = null;

/** Drawn inline in `renderer.ts` (interleaved with the foreground-nature
 *  cache blit + reactive decorations); the renderer calls
 *  `fogParticlesEntity.draw` directly rather than via `getEntitiesForLayer`. */
export const fogParticlesEntity: EntityKind<FogParticle> = {
  id: 'fogParticles',
  mirror: 'none',

  init({ theme }) {
    const fc = theme.fog;
    if (!fc) return [];
    const out: FogParticle[] = [];
    for (let i = 0; i < fc.count; i++) {
      out.push({
        x: Math.random() * CANVAS_WIDTH,
        y: fc.baseY + (Math.random() * 2 - 1) * fc.yVariance,
        vx: randRange(fc.speedRange),
        alpha: randRange(fc.alphaRange),
      });
    }
    return out;
  },

  cosmeticStep(_state, { dt, state: matchState }) {
    if (getSlowDevice()) return;
    updateFog(matchState, dt);
  },

  draw(ctx, state, { theme }) {
    const fogCfg = theme.fog;
    if (!fogCfg || state.length === 0) return;
    if (!_cache || _cache.themeFog !== fogCfg) {
      _cache = { themeFog: fogCfg, rgb: hexToRGB(fogCfg.color) };
    }
    const { r, g, b } = _cache.rgb;
    const opacity = fogCfg.opacity ?? 0.3;
    // Alpha-bucket into a few passes (same pattern as waterfall spray/mist):
    // one path + fill per bucket instead of one fill per particle.
    const maxA = (fogCfg.alphaRange?.[1] ?? 1) * opacity;
    const FOG_BUCKETS = 4;
    ctx.save();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    for (let bkt = 0; bkt < FOG_BUCKETS; bkt++) {
      ctx.globalAlpha = (bkt + 0.5) / FOG_BUCKETS * maxA;
      ctx.beginPath();
      for (const fp of state) {
        const eff = fp.alpha * opacity;
        const bucket = maxA > 0 ? Math.min(FOG_BUCKETS - 1, Math.floor(eff / maxA * FOG_BUCKETS)) : 0;
        if (bucket !== bkt) continue;
        ctx.moveTo(fp.x + fogCfg.sizeX, fp.y);
        ctx.ellipse(fp.x, fp.y, fogCfg.sizeX, fogCfg.sizeY, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  },
};
