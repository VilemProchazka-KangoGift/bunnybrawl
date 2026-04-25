import type { MatchState } from '../types';
import type { ThemeConfig } from '../themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { fastSin, fastCos } from '../fastMath';

function lerpCh(a: number, b: number, t: number): number { return Math.round(a + (b - a) * t); }

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
// Per-frame scratch — populated once in the firefly block so the glow + body
// passes can iterate twice without recomputing trig.
const FIREFLY_X = new Float32Array(FIREFLY_COUNT);
const FIREFLY_Y = new Float32Array(FIREFLY_COUNT);
const FIREFLY_PULSE = new Float32Array(FIREFLY_COUNT);
{
  const skyHeight = CANVAS_HEIGHT * 0.6;
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    FIREFLY_BASE_X[i] = (i * 173 + 57) % CANVAS_WIDTH;
    FIREFLY_BASE_Y[i] = 100 + ((i * 211 + 29) % skyHeight);
  }
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
  // dayPhase: 0 = noon, 0.5 = midnight, 1.0 = noon again
  // Use cosine so darkness peaks smoothly at 0.5
  const nightIntensity = Math.max(0, (1 - Math.cos(dayPhase * Math.PI * 2)) / 2);
  // nightIntensity: 0 at noon, 1 at midnight, smooth transition
  const overlayAlpha = nightIntensity * 0.55;

  // Sun: visible when nightIntensity < 0.8, arcs left->right during day half (0.75->0.0->0.25)
  // Remap dayPhase so sun progress 0->1 = sunrise->sunset
  const sunPhase = ((dayPhase + 0.25) % 1); // shift so 0=sunrise(6am), 0.5=sunset(6pm)
  let sunX = CANVAS_WIDTH / 2;
  let sunY = 80;
  if (sunPhase < 0.5) {
    const sunT = sunPhase / 0.5; // 0->1 across the day
    sunX = 60 + sunT * (CANVAS_WIDTH - 120);
    const sunArc = Math.sin(sunT * Math.PI);
    sunY = 130 - sunArc * 90;
    const sunAlpha = Math.min(1, (1 - nightIntensity) * 1.5);

    // Sun redshift: gold -> deep orange as sun approaches horizon
    const sunRedshift = Math.max(0, (sunT - 0.55) / 0.45);

    if (sunAlpha > 0.05) {
      const glowAlpha = sunAlpha * (0.3 + sunRedshift * 0.2);
      const bodyAlpha = sunAlpha * 0.9;
      // Glow (gold -> deep red, grows during sunset)
      ctx.fillStyle = `rgba(${lerpCh(255,240,sunRedshift)}, ${lerpCh(215,50,sunRedshift)}, ${lerpCh(0,10,sunRedshift)}, ${glowAlpha})`;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 32 + sunRedshift * 16, 0, Math.PI * 2);
      ctx.fill();
      // Body (orange -> crimson)
      ctx.fillStyle = `rgba(${lerpCh(255,220,sunRedshift)}, ${lerpCh(165,30,sunRedshift)}, ${lerpCh(0,10,sunRedshift)}, ${bodyAlpha})`;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 15, 0, Math.PI * 2);
      ctx.fill();
      // Bright center (gold -> deep orange) -- inherits body alpha
      ctx.fillStyle = `rgba(${lerpCh(255,255,sunRedshift)}, ${lerpCh(215,80,sunRedshift)}, ${lerpCh(0,10,sunRedshift)}, ${bodyAlpha})`;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
      ctx.fill();

      // Light rays from sun. All 4 rays share the same color — built into
      // one path so a single fill renders all of them.
      if (nightIntensity < 0.3) {
        const rayAlpha = 0.04 * (1 - nightIntensity / 0.3);
        ctx.fillStyle = `rgba(255, ${lerpCh(215,60,sunRedshift)}, ${lerpCh(100,15,sunRedshift)}, ${rayAlpha})`;
        ctx.beginPath();
        for (let r = 0; r < 4; r++) {
          const angle = -0.3 + r * 0.2;
          const rayW = 60 + r * 20;
          const rayDx = fastCos(angle) * 400;
          ctx.moveTo(sunX, sunY);
          ctx.lineTo(sunX + rayDx - rayW / 2, CANVAS_HEIGHT);
          ctx.lineTo(sunX + rayDx + rayW / 2, CANVAS_HEIGHT);
          ctx.closePath();
        }
        ctx.fill();
      }
    }
  }

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
    // Gradient overlay: warm orange-red, stronger near horizon
    const agGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    agGrad.addColorStop(0, `rgba(220, 40, 10, ${afterglowIntensity * 0.10})`);
    agGrad.addColorStop(0.35, `rgba(240, 55, 15, ${afterglowIntensity * 0.20})`);
    agGrad.addColorStop(0.65, `rgba(230, 45, 10, ${afterglowIntensity * 0.28})`);
    agGrad.addColorStop(1.0, `rgba(200, 35, 10, ${afterglowIntensity * 0.22})`);
    ctx.fillStyle = agGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // Darkness overlay
  if (overlayAlpha > 0.02) {
    ctx.fillStyle = `rgba(10, 12, 45, ${overlayAlpha})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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
    const twinkleT = frameTime / 500;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < STAR_COUNT; i++) {
      const twinkle = fastSin(twinkleT + STAR_PHASE[i]) * 0.3 + 0.7;
      ctx.globalAlpha = starAlpha * twinkle;
      ctx.beginPath();
      ctx.arc(STAR_X[i], STAR_Y[i], STAR_SIZE[i], 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (nightIntensity > 0.4 && theme.dayNight.showFireflies) {
    const fireflyAlpha = Math.min((nightIntensity - 0.4) / 0.4, 1) * 0.7;
    const now = frameTime / 1000;
    // Compute fx/fy/pulse once; the glow + body passes both read these.
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      FIREFLY_X[i] = FIREFLY_BASE_X[i] + fastSin(now * 0.5 + i * 2.3) * 30;
      FIREFLY_Y[i] = FIREFLY_BASE_Y[i] + fastCos(now * 0.4 + i * 1.7) * 20;
      FIREFLY_PULSE[i] = fastSin(now * 2 + i * 1.1) * 0.3 + 0.7;
    }
    ctx.fillStyle = '#AAFF44';
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      ctx.globalAlpha = fireflyAlpha * FIREFLY_PULSE[i] * 0.3;
      ctx.beginPath();
      ctx.arc(FIREFLY_X[i], FIREFLY_Y[i], 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#CCFF66';
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      ctx.globalAlpha = fireflyAlpha * FIREFLY_PULSE[i];
      ctx.beginPath();
      ctx.arc(FIREFLY_X[i], FIREFLY_Y[i], 2, 0, Math.PI * 2);
      ctx.fill();
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
