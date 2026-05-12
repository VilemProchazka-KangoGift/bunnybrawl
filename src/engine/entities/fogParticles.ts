import type { MatchState } from '../types';
import type { EntityKind } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
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

export const fogParticlesEntity: EntityKind<FogParticle> = {
  id: 'fogParticles',
  renderLayer: 'postPlayers',
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
    void CANVAS_HEIGHT;  // referenced for parity with original site
    const fogCfg = theme.fog;
    if (!fogCfg || state.length === 0) return;
    if (!_cache || _cache.themeFog !== fogCfg) {
      _cache = { themeFog: fogCfg, rgb: hexToRGB(fogCfg.color) };
    }
    const { r, g, b } = _cache.rgb;
    const opacity = fogCfg.opacity ?? 0.3;
    ctx.save();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    for (const fp of state) {
      ctx.globalAlpha = fp.alpha * opacity;
      ctx.beginPath();
      ctx.ellipse(fp.x, fp.y, fogCfg.sizeX, fogCfg.sizeY, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
};
