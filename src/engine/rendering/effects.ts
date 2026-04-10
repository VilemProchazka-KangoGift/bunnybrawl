import type { MatchState } from '../types';
import type { ThemeConfig } from '../themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';

function lerpCh(a: number, b: number, t: number): number { return Math.round(a + (b - a) * t); }

export function drawDayNightCycle(
  ctx: CanvasRenderingContext2D,
  dayPhase: number,
  matchState: MatchState | undefined,
  theme: ThemeConfig,
  frameTime: number,
): void {
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
      ctx.save();
      // Glow (gold -> deep red, grows during sunset)
      ctx.globalAlpha = sunAlpha * (0.3 + sunRedshift * 0.2);
      ctx.fillStyle = `rgb(${lerpCh(255,240,sunRedshift)}, ${lerpCh(215,50,sunRedshift)}, ${lerpCh(0,10,sunRedshift)})`;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 32 + sunRedshift * 16, 0, Math.PI * 2);
      ctx.fill();
      // Body (orange -> crimson)
      ctx.globalAlpha = sunAlpha * 0.9;
      ctx.fillStyle = `rgb(${lerpCh(255,220,sunRedshift)}, ${lerpCh(165,30,sunRedshift)}, ${lerpCh(0,10,sunRedshift)})`;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 15, 0, Math.PI * 2);
      ctx.fill();
      // Bright center (gold -> deep orange)
      ctx.fillStyle = `rgb(${lerpCh(255,255,sunRedshift)}, ${lerpCh(215,80,sunRedshift)}, ${lerpCh(0,10,sunRedshift)})`;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Light rays from sun (m) -- during daytime, warmed during sunset
      if (nightIntensity < 0.3) {
        ctx.save();
        const rayAlpha = 0.04 * (1 - nightIntensity / 0.3);
        ctx.fillStyle = `rgba(255, ${lerpCh(215,60,sunRedshift)}, ${lerpCh(100,15,sunRedshift)}, ${rayAlpha})`;
        for (let r = 0; r < 4; r++) {
          const angle = -0.3 + r * 0.2;
          const rayW = 60 + r * 20;
          ctx.beginPath();
          ctx.moveTo(sunX, sunY);
          ctx.lineTo(sunX + Math.cos(angle) * 400 - rayW / 2, CANVAS_HEIGHT);
          ctx.lineTo(sunX + Math.cos(angle) * 400 + rayW / 2, CANVAS_HEIGHT);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
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
    ctx.save();
    // Gradient overlay: warm orange-red, stronger near horizon
    const agGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    agGrad.addColorStop(0, `rgba(220, 40, 10, ${afterglowIntensity * 0.10})`);
    agGrad.addColorStop(0.35, `rgba(240, 55, 15, ${afterglowIntensity * 0.20})`);
    agGrad.addColorStop(0.65, `rgba(230, 45, 10, ${afterglowIntensity * 0.28})`);
    agGrad.addColorStop(1.0, `rgba(200, 35, 10, ${afterglowIntensity * 0.22})`);
    ctx.fillStyle = agGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  }

  // Darkness overlay
  if (overlayAlpha > 0.02) {
    ctx.save();
    ctx.fillStyle = `rgba(10, 12, 45, ${overlayAlpha})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
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
      ctx.save();
      // Glow
      ctx.globalAlpha = moonAlpha * 0.15;
      ctx.fillStyle = '#AABBDD';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
      ctx.fill();
      // Moon body
      ctx.globalAlpha = moonAlpha * 0.9;
      ctx.fillStyle = '#E8E8F0';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
      ctx.fill();
      // Crescent shadow
      ctx.fillStyle = `rgba(10, 12, 45, ${overlayAlpha + 0.3})`;
      ctx.beginPath();
      ctx.arc(moonX + 5, moonY - 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Stars
  if (nightIntensity > 0.25) {
    const starAlpha = Math.min((nightIntensity - 0.25) / 0.5, 1) * 0.8;
    for (let i = 0; i < 30; i++) {
      const sx = ((i * 137 + 83) % CANVAS_WIDTH);
      const sy = ((i * 97 + 41) % (CANVAS_HEIGHT * 0.35));
      const size = 1 + (i % 3) * 0.5;
      const twinkle = Math.sin(frameTime / 500 + i * 1.7) * 0.3 + 0.7;
      const a = starAlpha * twinkle;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Fireflies (conditional on theme)
  if (nightIntensity > 0.4 && theme.dayNight.showFireflies) {
    const fireflyAlpha = Math.min((nightIntensity - 0.4) / 0.4, 1) * 0.7;
    const now = frameTime / 1000;
    for (let i = 0; i < 8; i++) {
      const baseX = ((i * 173 + 57) % CANVAS_WIDTH);
      const baseY = 100 + ((i * 211 + 29) % (CANVAS_HEIGHT * 0.6));
      const fx = baseX + Math.sin(now * 0.5 + i * 2.3) * 30;
      const fy = baseY + Math.cos(now * 0.4 + i * 1.7) * 20;
      const pulse = Math.sin(now * 2 + i * 1.1) * 0.3 + 0.7;
      const a1 = fireflyAlpha * pulse * 0.3;
      ctx.fillStyle = `rgba(170,255,68,${a1})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 6, 0, Math.PI * 2);
      ctx.fill();
      const a2 = fireflyAlpha * pulse;
      ctx.fillStyle = `rgba(204,255,102,${a2})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Shooting stars (n)
  if (matchState?.shootingStars) {
    ctx.save();
    for (const star of matchState.shootingStars) {
      const alpha = Math.min(1, star.life * 2);
      // Tail: line from current pos back along velocity
      const tailLen = star.tailLen;
      const angle = Math.atan2(star.vy, star.vx);
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(star.x, star.y);
      ctx.lineTo(star.x - Math.cos(angle) * tailLen, star.y - Math.sin(angle) * tailLen);
      ctx.stroke();
      // Head: bright dot
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(star.x, star.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
