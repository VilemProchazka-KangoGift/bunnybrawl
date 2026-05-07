import type { MatchState } from '../types';
import type { ThemeConfig } from '../themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { fastSin, fastCos } from '../fastMath';
import { bakeVerticalGradientStrip } from '../themes/utils';


/** dayPhase 0=noon, 0.5=midnight, 1=noon. Returns 0..1 night intensity. */
export function computeNightIntensity(dayPhase: number): number {
  return Math.max(0, (1 - fastCos(dayPhase * Math.PI * 2)) / 2);
}

// Precomputed static star positions — i*K+J formulas were re-evaluated every
// frame for 30 stars. Now they're frozen at module load.
const STAR_COUNT = 30;
const STAR_X = new Float32Array(STAR_COUNT);
const STAR_Y = new Float32Array(STAR_COUNT);
const STAR_SIZE = new Float32Array(STAR_COUNT);
const STAR_PHASE = new Float32Array(STAR_COUNT); // i * 1.7 baked in
{
  const skyMaxY = CANVAS_HEIGHT * 0.35;
  for (let i = 0; i < STAR_COUNT; i++) {
    STAR_X[i] = (i * 137 + 83) % CANVAS_WIDTH;
    STAR_Y[i] = (i * 97 + 41) % skyMaxY;
    STAR_SIZE[i] = 1 + (i % 3) * 0.5;
    STAR_PHASE[i] = i * 1.7;
  }
}

const FIREFLY_COUNT = 8;
const FIREFLY_BASE_X = new Float32Array(FIREFLY_COUNT);
const FIREFLY_BASE_Y = new Float32Array(FIREFLY_COUNT);
{
  const skyHeight = CANVAS_HEIGHT * 0.6;
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    FIREFLY_BASE_X[i] = (i * 173 + 57) % CANVAS_WIDTH;
    FIREFLY_BASE_Y[i] = 100 + ((i * 211 + 29) % skyHeight);
  }
}

// Pre-rendered visuals. Stars: the entire 30-star field baked into one bitmap
// — replaces 30 fills/frame with a single drawImage. Tradeoff: per-star
// twinkle is replaced by a single uniform fade modulated by globalAlpha.
// Fireflies: a single 12×12 stamp (glow + body composited at the right alpha
// ratios) — replaces 16 fills/frame (8×glow + 8×body) with 8 drawImages,
// preserving per-firefly position and pulse.
const STAR_FIELD_HEIGHT = Math.ceil(CANVAS_HEIGHT * 0.35);
let _starField: OffscreenCanvas | null = null;
let _firefly: OffscreenCanvas | null = null;
// Full-canvas gradient fillRect was costing ~5ms/frame during dawn/dusk windows.
// Cached strip + drawImage at no-smooth is ~10× cheaper. See docs/perf-patterns.md.
let _afterglowCache: OffscreenCanvas | null = null;
function getAfterglowCache(): OffscreenCanvas | null {
  if (_afterglowCache) return _afterglowCache;
  _afterglowCache = bakeVerticalGradientStrip(CANVAS_HEIGHT, g => {
    g.addColorStop(0, 'rgba(220, 40, 10, 0.10)');
    g.addColorStop(0.35, 'rgba(240, 55, 15, 0.20)');
    g.addColorStop(0.65, 'rgba(230, 45, 10, 0.28)');
    g.addColorStop(1.0, 'rgba(200, 35, 10, 0.22)');
  });
  return _afterglowCache;
}
function getStarField(): OffscreenCanvas | null {
  if (_starField) return _starField;
  if (typeof OffscreenCanvas === 'undefined') return null;
  _starField = new OffscreenCanvas(CANVAS_WIDTH, STAR_FIELD_HEIGHT);
  const c = _starField.getContext('2d')!;
  c.fillStyle = '#FFFFFF';
  for (let i = 0; i < STAR_COUNT; i++) {
    c.beginPath();
    c.arc(STAR_X[i], STAR_Y[i], STAR_SIZE[i], 0, Math.PI * 2);
    c.fill();
  }
  return _starField;
}
function getFireflyStamp(): OffscreenCanvas | null {
  if (_firefly) return _firefly;
  if (typeof OffscreenCanvas === 'undefined') return null;
  _firefly = new OffscreenCanvas(12, 12);
  const c = _firefly.getContext('2d')!;
  // Glow at 0.3, body at 1.0 — same ratio the original two-pass code used,
  // multiplied through globalAlpha = pulse*fireflyAlpha at draw time.
  c.fillStyle = '#AAFF44';
  c.globalAlpha = 0.3;
  c.beginPath(); c.arc(6, 6, 6, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#CCFF66';
  c.globalAlpha = 1;
  c.beginPath(); c.arc(6, 6, 2, 0, Math.PI * 2); c.fill();
  return _firefly;
}

export function drawDayNightCycle(
  ctx: CanvasRenderingContext2D,
  dayPhase: number,
  matchState: MatchState | undefined,
  theme: ThemeConfig,
  frameTime: number,
): void {
  // Wrap in save/restore so per-star/per-firefly globalAlpha mutations don't
  // leak to subsequent renderFrame stages. Entry globalAlpha is preserved.
  ctx.save();
  const nightIntensity = computeNightIntensity(dayPhase);
  const overlayAlpha = nightIntensity * 0.55;

  // Sunset afterglow: warm redshift overlay during golden hour
  // dayPhase 0.25 = sunset; ramp in 0.16->0.25, linger + fade 0.25->0.38
  let afterglowIntensity = 0;
  if (dayPhase > 0.16 && dayPhase < 0.38) {
    if (dayPhase < 0.25) {
      afterglowIntensity = (dayPhase - 0.16) / 0.09;
    } else {
      afterglowIntensity = 1 - (dayPhase - 0.25) / 0.13;
    }
    // Smoothstep for natural ramp
    afterglowIntensity = afterglowIntensity * afterglowIntensity * (3 - 2 * afterglowIntensity);
  }
  if (afterglowIntensity > 0.01) {
    const cache = getAfterglowCache();
    if (cache) {
      ctx.save();
      ctx.globalAlpha = afterglowIntensity;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cache, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    }
  }

  // Moon: visible when nightIntensity > 0.2, arcs during night half (0.25->0.5->0.75)
  const moonPhase = ((dayPhase + 0.75) % 1); // shift so 0=moonrise, 0.5=moonset
  if (moonPhase < 0.5) {
    const moonT = moonPhase / 0.5;
    const moonX = 60 + moonT * (CANVAS_WIDTH - 120);
    const moonArc = Math.sin(moonT * Math.PI);
    const moonY = 110 - moonArc * 70;
    const moonAlpha = Math.min(1, nightIntensity * 2);

    if (moonAlpha > 0.05) {
      // Glow
      ctx.fillStyle = `rgba(170, 187, 221, ${moonAlpha * 0.15})`;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
      ctx.fill();
      // Moon body
      ctx.fillStyle = `rgba(232, 232, 240, ${moonAlpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
      ctx.fill();
      // Crescent shadow -- inherits body alpha through globalAlpha multiply originally.
      // Effective: rgba(10,12,45,overlayAlpha+0.3) * (moonAlpha*0.9)
      ctx.fillStyle = `rgba(10, 12, 45, ${(overlayAlpha + 0.3) * moonAlpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(moonX + 5, moonY - 2, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (nightIntensity > 0.25) {
    const starAlpha = Math.min((nightIntensity - 0.25) / 0.5, 1) * 0.8;
    const stars = getStarField();
    if (stars) {
      // Slow uniform twinkle (~3% amplitude) keeps the night sky from feeling
      // static. Per-star phase variation is gone; tradeoff documented above.
      const twinkle = 0.97 + fastSin(frameTime / 500) * 0.03;
      ctx.globalAlpha = starAlpha * twinkle;
      ctx.drawImage(stars, 0, 0);
    } else {
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < STAR_COUNT; i++) {
        const twinkle = fastSin(frameTime / 500 + STAR_PHASE[i]) * 0.3 + 0.7;
        ctx.globalAlpha = starAlpha * twinkle;
        ctx.beginPath();
        ctx.arc(STAR_X[i], STAR_Y[i], STAR_SIZE[i], 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (nightIntensity > 0.4 && theme.dayNight.showFireflies) {
    const fireflyAlpha = Math.min((nightIntensity - 0.4) / 0.4, 1) * 0.7;
    const now = frameTime / 1000;
    const stamp = getFireflyStamp();
    if (stamp) {
      for (let i = 0; i < FIREFLY_COUNT; i++) {
        const fx = FIREFLY_BASE_X[i] + fastSin(now * 0.5 + i * 2.3) * 30;
        const fy = FIREFLY_BASE_Y[i] + fastCos(now * 0.4 + i * 1.7) * 20;
        const pulse = fastSin(now * 2 + i * 1.1) * 0.3 + 0.7;
        ctx.globalAlpha = fireflyAlpha * pulse;
        ctx.drawImage(stamp, fx - 6, fy - 6);
      }
    } else {
      ctx.fillStyle = '#AAFF44';
      for (let i = 0; i < FIREFLY_COUNT; i++) {
        const fx = FIREFLY_BASE_X[i] + fastSin(now * 0.5 + i * 2.3) * 30;
        const fy = FIREFLY_BASE_Y[i] + fastCos(now * 0.4 + i * 1.7) * 20;
        const pulse = fastSin(now * 2 + i * 1.1) * 0.3 + 0.7;
        ctx.globalAlpha = fireflyAlpha * pulse * 0.3;
        ctx.beginPath();
        ctx.arc(fx, fy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#CCFF66';
        ctx.globalAlpha = fireflyAlpha * pulse;
        ctx.beginPath();
        ctx.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#AAFF44';
      }
    }
  }

  // Shooting stars
  if (matchState?.shootingStars) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    for (const star of matchState.shootingStars) {
      const alpha = Math.min(1, star.life * 2);
      const tailLen = star.tailLen;
      const angle = Math.atan2(star.vy, star.vx);
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.moveTo(star.x, star.y);
      ctx.lineTo(star.x - fastCos(angle) * tailLen, star.y - fastSin(angle) * tailLen);
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(star.x, star.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
