import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

export interface SimpleWildlife {
  x: number; y: number; vx: number; wingPhase: number;
  type: 'butterfly' | 'bird'; color: string;
}

const BUTTERFLY_COLORS = ['#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD', '#FFA07A'];
const BIRD_COLORS = ['#333', '#555', '#4A4A4A'];

export function initWildlife(count: number, groundY: number, birdRatio = 0.7): SimpleWildlife[] {
  const result: SimpleWildlife[] = [];
  for (let i = 0; i < count; i++) {
    const isBird = i >= count * birdRatio;
    result.push({
      x: Math.random() * CANVAS_WIDTH,
      y: isBird ? 30 + Math.random() * 80 : groundY * 0.3 + Math.random() * groundY * 0.5,
      vx: isBird ? 40 + Math.random() * 40 : 15 + Math.random() * 15,
      wingPhase: Math.random() * Math.PI * 2,
      type: isBird ? 'bird' : 'butterfly',
      color: isBird ? BIRD_COLORS[i % BIRD_COLORS.length] : BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length],
    });
  }
  return result;
}

export function updateAndDrawWildlife(ctx: CanvasRenderingContext2D, wildlife: SimpleWildlife[], dt: number, groundY: number): void {
  for (const w of wildlife) {
    w.x += w.vx * dt;
    w.wingPhase += dt * (w.type === 'bird' ? 6 : 10);
    if (w.x > CANVAS_WIDTH + 20) { w.x = -20; w.y = w.type === 'bird' ? 30 + Math.random() * 80 : groundY * 0.3 + Math.random() * groundY * 0.5; }

    ctx.save();
    ctx.translate(w.x, w.y + Math.sin(w.wingPhase * 0.3) * (w.type === 'butterfly' ? 8 : 3));

    if (w.type === 'butterfly') {
      const wing = Math.sin(w.wingPhase) * 0.6;
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-6 * Math.cos(wing), -4 * Math.abs(Math.sin(wing)) - 3); ctx.lineTo(-3, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(6 * Math.cos(wing), -4 * Math.abs(Math.sin(wing)) - 3); ctx.lineTo(3, 0);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.fillRect(-0.5, -1.5, 1, 3);
    } else {
      const flap = Math.sin(w.wingPhase) * 4;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, flap); ctx.lineTo(-3, -3); ctx.lineTo(0, 0); ctx.lineTo(3, -3); ctx.lineTo(8, flap);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawDayNightCycle(ctx: CanvasRenderingContext2D, now: number, cycleDuration: number): void {
  const dayPhase = (now % cycleDuration) / cycleDuration;
  const nightIntensity = Math.max(0, (1 - Math.cos(dayPhase * Math.PI * 2)) / 2);

  // Sun (visible first half of cycle)
  if (dayPhase < 0.5) {
    const sp = dayPhase / 0.5;
    const sx = 60 + sp * 1160;
    const sy = 130 - Math.sin(sp * Math.PI) * 90;
    const rs = Math.max(0, Math.abs(sp - 0.5) * 2 - 0.3) * 0.7;
    ctx.save();
    ctx.globalAlpha = 1 - nightIntensity;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 48);
    g.addColorStop(0, `rgba(255,${Math.round(220 - rs * 80)},${Math.round(50 - rs * 50)},0.3)`);
    g.addColorStop(1, 'rgba(255,200,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, 48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(255,${Math.round(230 - rs * 100)},${Math.round(80 - rs * 80)})`;
    ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(255,${Math.round(245 - rs * 50)},${Math.round(150 - rs * 100)})`;
    ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Darkness overlay
  if (nightIntensity > 0.02) {
    ctx.save();
    ctx.globalAlpha = nightIntensity * 0.55;
    ctx.fillStyle = 'rgb(10,12,45)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  }

  // Moon (visible second half)
  if (dayPhase >= 0.5) {
    const mp = (dayPhase - 0.5) / 0.5;
    const mx = 60 + mp * 1160;
    const my = 130 - Math.sin(mp * Math.PI) * 90;
    ctx.save();
    ctx.globalAlpha = nightIntensity;
    ctx.fillStyle = 'rgba(170,187,221,0.25)';
    ctx.beginPath(); ctx.arc(mx, my, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E8E8F0';
    ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgb(10,12,45)';
    ctx.beginPath(); ctx.arc(mx + 5, my - 2, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Stars (bake alpha into rgba to avoid per-element globalAlpha flushes)
  if (nightIntensity > 0.25) {
    for (let i = 0; i < 30; i++) {
      const stx = (i * 137 + 83) % CANVAS_WIDTH;
      const sty = (i * 89 + 47) % 200;
      const a = (nightIntensity - 0.25) * 2 * (Math.sin(now * 2 + i * 1.7) * 0.3 + 0.7);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(stx, sty, 1 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Fireflies (bake alpha into rgba)
  if (nightIntensity > 0.4) {
    for (let i = 0; i < 8; i++) {
      const bx = (i * 173 + 50) % CANVAS_WIDTH;
      const by = 300 + (i * 97) % 250;
      const fx = bx + Math.sin(now * 0.7 + i * 2.1) * 30;
      const fy = by + Math.cos(now * 0.5 + i * 1.3) * 20;
      const a = (nightIntensity - 0.4) * 1.5 * (Math.sin(now * 3 + i * 4.7) * 0.3 + 0.7);
      ctx.fillStyle = `rgba(170,255,68,${a})`;
      ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(204,255,102,${a})`;
      ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}
