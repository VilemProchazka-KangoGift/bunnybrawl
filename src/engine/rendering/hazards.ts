import type { ThemeConfig, ScatterFlockSpecies } from '../themes/types';
import { fastSin } from '../fastMath';
import { getSlowDevice } from '../perfFlags';

// Gradient caches keyed by the hz/zone object identity — arena objects are
// stable for the match lifetime, so a WeakMap avoids per-frame string-key
// allocation. Cleared via clearHazardCaches() on theme/arena change.
type LavaGradients = { body: CanvasGradient; halo: CanvasGradient };
type CurrentGradients = { water: CanvasGradient; highlight: CanvasGradient };
const cachedLavaGradients = new WeakMap<object, LavaGradients>();
const cachedZeroGBgGradients = new WeakMap<object, CanvasGradient>();
const cachedCurrentGradients = new WeakMap<object, CurrentGradients>();
const cachedGhostGlowGradients = new Map<string, CanvasGradient>();
const cachedJellyGradients = new WeakMap<object, CanvasGradient>();

// Hoisted dash patterns — setLineDash takes a fresh array otherwise.
const ZEROG_DASH: number[] = [8, 5];
const NO_DASH: number[] = [];

export function clearHazardCaches(): void {
  // WeakMaps drop entries when their key references go away (arena change).
  // The remaining Map keys on theme-derived strings still need explicit clearing.
  cachedGhostGlowGradients.clear();
}

export function drawHazardZone(
  ctx: CanvasRenderingContext2D,
  hz: { x: number; y: number; width: number; height: number; type: string },
  theme: ThemeConfig,
  time: number,
): void {
  if (theme.drawCustomHazardZone) {
    theme.drawCustomHazardZone(ctx, hz.x, hz.y, hz.width, hz.height, time);
    return;
  }
  ctx.save();
  if (hz.type === 'lava') {
    // Animated lava pool
    const pulse = 0.7 + fastSin(time * 3) * 0.15;
    const cx = hz.x + hz.width / 2;
    const cy = hz.y + hz.height / 2;

    // Lava body + halo (cached gradients keyed by hz identity)
    let cachedLava = cachedLavaGradients.get(hz as object);
    if (!cachedLava) {
      const body = ctx.createLinearGradient(hz.x, hz.y, hz.x, hz.y + hz.height);
      body.addColorStop(0, '#FF6600');
      body.addColorStop(0.5, '#FF4400');
      body.addColorStop(1, '#CC2200');
      const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, hz.width * 0.8);
      halo.addColorStop(0, 'rgba(255, 100, 0, 0.3)');
      halo.addColorStop(1, 'rgba(255, 60, 0, 0)');
      cachedLava = { body, halo };
      cachedLavaGradients.set(hz as object, cachedLava);
    }
    ctx.fillStyle = cachedLava.body;
    ctx.beginPath();
    ctx.ellipse(cx, cy, hz.width / 2, hz.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bright center (pulsing)
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#FFCC33';
    ctx.beginPath();
    ctx.ellipse(cx, cy, hz.width * 0.3, hz.height * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glow halo
    ctx.globalAlpha = 0.15 + fastSin(time * 2) * 0.05;
    ctx.fillStyle = cachedLava.halo;
    ctx.fillRect(hz.x - hz.width * 0.3, hz.y - hz.height, hz.width * 1.6, hz.height * 3);

    // Bubble spots
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FFAA00';
    const bubbleX = hz.x + hz.width * (0.3 + fastSin(time * 4) * 0.15);
    const bubbleY = hz.y + hz.height * 0.3;
    ctx.beginPath();
    ctx.arc(bubbleX, bubbleY, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawGhost(
  ctx: CanvasRenderingContext2D,
  ghost: { x: number; y: number; size: number; alpha: number; wobblePhase: number },
  theme: ThemeConfig,
  time: number,
): void {
  // Custom ghost renderer (e.g. wasps)
  if (theme.drawCustomGhost) {
    theme.drawCustomGhost(ctx, ghost.x, ghost.y + fastSin(ghost.wobblePhase + time * 2) * 3, ghost.size, ghost.alpha, time);
    return;
  }
  ctx.save();
  const wobble = fastSin(ghost.wobblePhase + time * 2) * 3;
  ctx.translate(ghost.x, ghost.y + wobble);
  ctx.globalAlpha = ghost.alpha * (0.5 + fastSin(time * 1.5) * 0.15);

  const gc = theme.ghostConfig;
  const color = gc?.color || '#AABBDD';
  const glowColor = gc?.glowColor || '#6688BB';
  const s = ghost.size;

  // Ghost glow (cached gradient)
  const gKey = `${s}_${glowColor}`;
  let glow = cachedGhostGlowGradients.get(gKey);
  if (!glow) {
    glow = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.5);
    glow.addColorStop(0, glowColor + '33');
    glow.addColorStop(1, glowColor + '00');
    cachedGhostGlowGradients.set(gKey, glow);
  }
  ctx.fillStyle = glow;
  ctx.fillRect(-s * 1.5, -s * 1.5, s * 3, s * 3);

  // Ghost body (rounded top, wavy bottom)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -s * 0.2, s * 0.5, Math.PI, 0);
  ctx.lineTo(s * 0.5, s * 0.3);
  // Wavy bottom
  const waves = 4;
  for (let w = 0; w < waves; w++) {
    const wx = s * 0.5 - (w + 1) * (s / waves);
    const wy = s * 0.3 + fastSin(time * 3 + w * 1.5) * s * 0.08;
    const cx = wx + s / (waves * 2);
    ctx.quadraticCurveTo(cx, wy + s * 0.12, wx, wy);
  }
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(-s * 0.15, -s * 0.2, s * 0.08, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(s * 0.15, -s * 0.2, s * 0.08, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.02, s * 0.1, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawLavaRock(
  ctx: CanvasRenderingContext2D,
  rock: { x: number; y: number; size: number; rotation: number },
  theme: ThemeConfig,
): void {
  const lrc = theme.lavaRockConfig;
  ctx.save();
  ctx.translate(rock.x, rock.y);
  ctx.rotate(rock.rotation);
  // Glow
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = lrc?.glowColor || '#FF6600';
  ctx.beginPath();
  ctx.arc(0, 0, rock.size * 1.8, 0, Math.PI * 2);
  ctx.fill();
  // Rock body -- jagged
  ctx.globalAlpha = 1;
  ctx.fillStyle = lrc?.color || '#4A2010';
  ctx.beginPath();
  const s = rock.size;
  ctx.moveTo(-s, -s * 0.3);
  ctx.lineTo(-s * 0.5, -s);
  ctx.lineTo(s * 0.3, -s * 0.8);
  ctx.lineTo(s, -s * 0.2);
  ctx.lineTo(s * 0.7, s * 0.6);
  ctx.lineTo(-s * 0.2, s * 0.8);
  ctx.lineTo(-s * 0.8, s * 0.3);
  ctx.closePath();
  ctx.fill();
  // Hot cracks
  ctx.strokeStyle = '#FF8800';
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.5);
  ctx.lineTo(s * 0.1, s * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.2, -s * 0.3);
  ctx.lineTo(-s * 0.1, s * 0.4);
  ctx.stroke();
  ctx.restore();
}

export function drawZeroGZone(
  ctx: CanvasRenderingContext2D,
  zone: { x: number; y: number; width: number; height: number },
  time: number,
): void {
  ctx.save();

  // Pulsing background fill (cached gradient keyed by zone identity)
  ctx.globalAlpha = 0.1 + fastSin(time * 1.5) * 0.04;
  let bgGrad = cachedZeroGBgGradients.get(zone as object);
  if (!bgGrad) {
    bgGrad = ctx.createLinearGradient(zone.x, zone.y, zone.x, zone.y + zone.height);
    bgGrad.addColorStop(0, 'rgba(0, 180, 255, 0.2)');
    bgGrad.addColorStop(0.5, 'rgba(0, 220, 255, 0.08)');
    bgGrad.addColorStop(1, 'rgba(0, 180, 255, 0.2)');
    cachedZeroGBgGradients.set(zone as object, bgGrad);
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(zone.x, zone.y, zone.width, zone.height);

  // Animated dashed border -- double line
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#00CCFF';
  ctx.lineWidth = 2;
  ctx.setLineDash(ZEROG_DASH);
  ctx.lineDashOffset = -time * 30;
  ctx.strokeRect(zone.x + 1, zone.y + 1, zone.width - 2, zone.height - 2);
  ctx.setLineDash(NO_DASH);

  // Corner brackets share lineWidth/strokeStyle with the dashed border above.
  ctx.globalAlpha = 0.4;
  const bLen = 15;
  const x0 = zone.x, x1 = zone.x + zone.width;
  const y0 = zone.y, y1 = zone.y + zone.height;
  ctx.beginPath();
  ctx.moveTo(x0 + bLen, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0, y0 + bLen);
  ctx.moveTo(x1 - bLen, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + bLen);
  ctx.moveTo(x0 + bLen, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - bLen);
  ctx.moveTo(x1 - bLen, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - bLen);
  ctx.stroke();

  // Floating particles — group by color into 2 batched fills instead of 12
  // individual ones. moveTo before each arc starts a new sub-path so circles
  // don't connect with lines.
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#44EEFF';
  ctx.beginPath();
  for (let i = 0; i < 12; i += 2) {
    const px = zone.x + 15 + (i * 47) % zone.width;
    const py = zone.y + zone.height - ((time * 25 + i * 30) % zone.height);
    const pSize = 1.5 + Math.sin(time + i) * 0.5;
    const ax = px + Math.sin(time * 1.5 + i) * 5;
    ctx.moveTo(ax + pSize, py);
    ctx.arc(ax, py, pSize, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = '#88CCFF';
  ctx.beginPath();
  for (let i = 1; i < 12; i += 2) {
    const px = zone.x + 15 + (i * 47) % zone.width;
    const py = zone.y + zone.height - ((time * 25 + i * 30) % zone.height);
    const pSize = 1.5 + Math.sin(time + i) * 0.5;
    const ax = px + Math.sin(time * 1.5 + i) * 5;
    ctx.moveTo(ax + pSize, py);
    ctx.arc(ax, py, pSize, 0, Math.PI * 2);
  }
  ctx.fill();

  // "0G" label
  ctx.globalAlpha = 0.2;
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#00DDFF';
  ctx.textAlign = 'center';
  ctx.fillText('0G', zone.x + zone.width / 2, zone.y + zone.height / 2 + 5);

  ctx.restore();
}

export function drawCurrentZone(
  ctx: CanvasRenderingContext2D,
  zone: { x: number; y: number; width: number; height: number; vx?: number; vy?: number },
  time: number,
): void {
  ctx.save();

  // Vertical waterfall current
  if (zone.vy && Math.abs(zone.vy) > Math.abs(zone.vx || 0)) {
    const zx = zone.x, zy = zone.y, zw = zone.width, zh = zone.height;
    const cx = zx + zw / 2;

    // Water body + center highlight gradients (cached by zone identity)
    let cachedGrads = cachedCurrentGradients.get(zone as object);
    if (!cachedGrads) {
      const water = ctx.createLinearGradient(0, zy, 0, zy + zh);
      water.addColorStop(0, 'rgba(140, 200, 240, 0.45)');
      water.addColorStop(0.3, 'rgba(100, 180, 230, 0.4)');
      water.addColorStop(1, 'rgba(70, 150, 210, 0.35)');
      const highlight = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0);
      highlight.addColorStop(0, 'rgba(255,255,255,0)');
      highlight.addColorStop(0.5, 'rgba(255,255,255,1)');
      highlight.addColorStop(1, 'rgba(255,255,255,0)');
      cachedGrads = { water, highlight };
      cachedCurrentGradients.set(zone as object, cachedGrads);
    }
    // Single closed polygon (right edge top→bottom, left edge bottom→top)
    // filled with the water gradient. Avoids a globalCompositeOperation
    // switch that destination-out cutouts would require.
    ctx.globalAlpha = 1;
    ctx.fillStyle = cachedGrads.water;
    ctx.beginPath();
    {
      const ex = zx + zw;
      const dir = 1;
      ctx.moveTo(ex + dir * 12, zy);
      ctx.lineTo(Math.sin(zy * 0.03 + time * 2.5) * 5 * dir * 0.5
        + Math.sin(zy * 0.07 + time * 1.8) * 3 * dir * 0.5 + ex, zy);
      for (let ey = zy + 8; ey <= zy + zh; ey += 8) {
        const wave = Math.sin(ey * 0.03 + time * 2.5) * 5 + Math.sin(ey * 0.07 + time * 1.8) * 3;
        ctx.lineTo(ex + wave * dir * 0.5, ey);
      }
      ctx.lineTo(ex + dir * 12, zy + zh);
    }
    {
      const ex = zx;
      const dir = -1;
      ctx.lineTo(ex + dir * 12, zy + zh);
      for (let ey = zy + zh; ey >= zy; ey -= 8) {
        const wave = Math.sin(ey * 0.03 + time * 2.5) * 5 + Math.sin(ey * 0.07 + time * 1.8) * 3;
        ctx.lineTo(ex + wave * dir * 0.5, ey);
      }
      ctx.lineTo(ex + dir * 12, zy);
    }
    ctx.closePath();
    ctx.fill();

    const speed = Math.abs(zone.vy) * 0.3;
    // Slow-device skips animated layers; keeps body + center highlight.
    if (getSlowDevice()) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = cachedGrads.highlight;
      ctx.fillRect(cx - 30, zy, 60, zh);
      ctx.restore();
      return;
    }

    // Flowing water columns -- wide semi-transparent bands moving downward
    const colCount = 5;
    ctx.fillStyle = '#D0EAFF';
    for (let i = 0; i < colCount; i++) {
      const colW = 20 + (i % 3) * 12;
      const baseX = zx + 30 + (i * (zw - 60)) / colCount + Math.sin(time * 1.2 + i * 1.7) * 10;
      const colLen = 80 + (i % 3) * 40;
      const colY = zy + ((time * speed + i * 97) % (zh + colLen)) - colLen;
      const y1 = Math.max(colY, zy);
      const y2 = Math.min(colY + colLen, zy + zh);
      if (y1 >= y2) continue;
      ctx.globalAlpha = 0.15 + 0.05 * Math.sin(time * 1.5 + i);
      ctx.beginPath();
      ctx.ellipse(baseX, (y1 + y2) / 2, colW / 2, (y2 - y1) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // White foam streaks -- thin fast lines for motion feel
    const streakCount = Math.max(14, Math.round(zw / 20));
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FFFFFF';
    for (let i = 0; i < streakCount; i++) {
      const sx = zx + 8 + ((i * 29 + Math.sin(i * 3.1) * 15) % (zw - 16));
      const streakLen = 40 + (i % 5) * 15;
      const sy = zy + ((time * speed * 1.2 + i * 37) % (zh + streakLen)) - streakLen;
      const y1 = Math.max(sy, zy);
      const y2 = Math.min(sy + streakLen, zy + zh);
      if (y1 >= y2) continue;
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(time * 2 + i * 0.8);
      ctx.beginPath();
      ctx.moveTo(sx, y1);
      ctx.lineTo(sx + Math.sin(time * 0.8 + i) * 4, y2);
      ctx.stroke();
    }

    // Splash/foam at the bottom of the waterfall
    const foamY = zy + zh;
    ctx.fillStyle = '#E8F4FF';
    for (let i = 0; i < 18; i++) {
      const fx = zx + 10 + (i / 18) * (zw - 20) + Math.sin(time * 3 + i * 1.3) * 8;
      const fy = foamY - 4 - Math.abs(Math.sin(time * 2.2 + i * 0.7)) * 18;
      const fr = 5 + Math.sin(time * 1.8 + i * 1.1) * 3;
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 1.5 + i);
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bright highlight down the center
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = cachedGrads.highlight;
    ctx.fillRect(cx - 30, zy, 60, zh);

    ctx.restore();
    return;
  }

  // Horizontal current (original logic)
  const dir = (zone.vx || 0) > 0 ? 1 : -1;
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#4488CC';
  ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
  // Flow arrows
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = '#88CCFF';
  ctx.lineWidth = 2;
  const spacing = 40;
  for (let dx = 0; dx < zone.width; dx += spacing) {
    const ax = zone.x + ((dx + time * Math.abs(zone.vx || 60)) % zone.width);
    const ay = zone.y + zone.height / 2;
    if (ax < zone.x || ax > zone.x + zone.width - 10) continue;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + dir * 12, ay);
    ctx.moveTo(ax + dir * 12, ay);
    ctx.lineTo(ax + dir * 7, ay - 4);
    ctx.moveTo(ax + dir * 12, ay);
    ctx.lineTo(ax + dir * 7, ay + 4);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawGeyser(
  ctx: CanvasRenderingContext2D,
  zone: { x: number; y: number; width: number; height: number },
  gs: { active: boolean; activeTimer: number },
  time: number,
): void {
  const cx = zone.x + zone.width / 2;
  if (gs.active) {
    // Active bubble column
    ctx.fillStyle = 'rgba(136, 204, 255, 0.2)';
    ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
    // Rising bubbles -- count scales with zone width
    // Original: strokeStyle rgba(180,220,255,0.5) * globalAlpha 0.4 = 0.2 effective
    ctx.strokeStyle = 'rgba(180, 220, 255, 0.2)';
    ctx.lineWidth = 1;
    const bubbleCount = Math.max(8, Math.round(zone.width / 8));
    for (let i = 0; i < bubbleCount; i++) {
      const by = zone.y + zone.height - ((time * 80 + i * 20) % zone.height);
      const bx = cx + Math.sin(time * 3 + i * 1.5) * (zone.width * 0.3);
      const bs = 2 + (i % 3);
      ctx.beginPath();
      ctx.arc(bx, by, bs, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // Dormant -- small bubbles at base
    ctx.fillStyle = 'rgba(136, 187, 221, 0.15)';
    for (let i = 0; i < 3; i++) {
      const bx = cx + Math.sin(time * 2 + i) * 5;
      const by = zone.y + zone.height - 5 - Math.abs(Math.sin(time * 1.5 + i * 2)) * 8;
      ctx.beginPath();
      ctx.arc(bx, by, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawBouncyPlatformOverlay(
  ctx: CanvasRenderingContext2D,
  bp: { x: number; y: number; width: number; height: number },
  wobble: number,
  time: number,
): void {
  ctx.save();

  // Wobbly jelly surface — always visible. Draw the wavy edge along the
  // BACK edge of the 3D cap (CAP_DEPTH/2 = 8 px above bp.y) so the animation
  // sits at the iso parallelogram's far rim instead of bisecting the cap face.
  // fastSin precision is fine for pure-visual displacement.
  const waveBackOffset = 8;
  const wobbleY = fastSin(time * 3) * 2;
  ctx.globalAlpha = 0.25;
  let jellyGrad = cachedJellyGradients.get(bp as object);
  if (!jellyGrad) {
    jellyGrad = ctx.createLinearGradient(bp.x, bp.y - waveBackOffset - 4, bp.x, bp.y + bp.height);
    jellyGrad.addColorStop(0, '#FF69B4');
    jellyGrad.addColorStop(0.5, '#FF99CC');
    jellyGrad.addColorStop(1, '#FF69B4');
    cachedJellyGradients.set(bp as object, jellyGrad);
  }
  ctx.fillStyle = jellyGrad;
  ctx.beginPath();
  ctx.moveTo(bp.x, bp.y + bp.height);
  ctx.lineTo(bp.x, bp.y - waveBackOffset);
  // Wavy top edge along the cap's back rim
  const xEnd = bp.x + bp.width;
  const t4 = time * 4;
  for (let wx = bp.x; wx <= xEnd; wx += 10) {
    const wy = bp.y - waveBackOffset - 2 + fastSin(t4 + wx * 0.1) * 2 + wobbleY;
    ctx.lineTo(wx, wy);
  }
  ctx.lineTo(xEnd, bp.y + bp.height);
  ctx.closePath();
  ctx.fill();

  // Bounce wobble -- big jiggle effect
  if (wobble > 0) {
    const intensity = wobble * 5;
    const absSquash = Math.abs(fastSin(wobble * 30) * intensity);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#FFB6C1';
    ctx.fillRect(bp.x - 2, bp.y - absSquash - 2, bp.width + 4, bp.height + absSquash + 2);
  }

  // Pulsing glow underneath
  ctx.globalAlpha = 0.1 + fastSin(time * 2) * 0.05;
  ctx.fillStyle = '#FF69B4';
  ctx.fillRect(bp.x, bp.y + bp.height, bp.width, 4);

  // Up-arrow indicators — typically 2–5 arrows per platform, all same color.
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#FFFFFF';
  const arrowCount = Math.max(2, Math.floor(bp.width / 35));
  const t3 = time * 3;
  const cy = bp.y + bp.height / 2;
  ctx.beginPath();
  for (let a = 0; a < arrowCount; a++) {
    const ax = bp.x + bp.width * (a + 0.5) / arrowCount;
    const ay = cy + fastSin(t3 + a) * 2;
    ctx.moveTo(ax - 4, ay + 3);
    ctx.lineTo(ax, ay - 3);
    ctx.lineTo(ax + 4, ay + 3);
    ctx.closePath();
  }
  ctx.fill();

  ctx.restore();
}

export function drawPigeonFlock(
  ctx: CanvasRenderingContext2D,
  flock: { x: number; y: number; active: boolean; scatterParticles: Array<{ x: number; y: number; vx: number; vy: number; life: number }> },
  time: number,
): void {
  ctx.save();
  if (flock.active) {
    // Draw sitting pigeons (3 birds)
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 3; i++) {
      const px = flock.x - 10 + i * 10;
      const py = flock.y - 4;
      // Body
      ctx.fillStyle = '#7A7A8A';
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(px + 4, py - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#CCAA44';
      ctx.beginPath();
      ctx.moveTo(px + 6, py - 3);
      ctx.lineTo(px + 8, py - 2.5);
      ctx.lineTo(px + 6, py - 2);
      ctx.fill();
      // Head bob
      if (Math.sin(time * 4 + i * 2) > 0.7) {
        ctx.fillStyle = '#7A7A8A';
        ctx.beginPath();
        ctx.arc(px + 4, py - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Scatter particles (flying birds)
  for (const sp of flock.scatterParticles) {
    ctx.globalAlpha = Math.min(1, sp.life) * 0.6;
    ctx.fillStyle = '#6A6A7A';
    // Body
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wings (flapping)
    const wing = Math.sin(sp.life * 30) * 6;
    ctx.beginPath();
    ctx.moveTo(sp.x - 3, sp.y);
    ctx.lineTo(sp.x - 8, sp.y + wing);
    ctx.lineTo(sp.x - 2, sp.y);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sp.x + 3, sp.y);
    ctx.lineTo(sp.x + 8, sp.y + wing);
    ctx.lineTo(sp.x + 2, sp.y);
    ctx.fill();
  }
  ctx.restore();
}

const BIRD_PALETTE = ['#3a4a8a', '#a85a3a', '#5a8a3a'] as const;

// Per-bird offsets — broken into two clusters with vertical jitter so the
// flock reads as natural perching, not a regimented line.
const BIRD_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -14, dy: -3 },
  { dx: -6,  dy: -7 },
  { dx: 6,   dy: -2 },
  { dx: 16,  dy: -5 },
];

const CROW_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -12, dy: -4 },
  { dx: 2,   dy: -6 },
  { dx: 14,  dy: -3 },
];

const BAT_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -14, dy: 0 },
  { dx: 0,   dy: 3 },
  { dx: 14,  dy: 1 },
];

const PERCHED_FLOCK_DRAWERS: Record<ScatterFlockSpecies, (ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number) => void> = {
  bat: (ctx, cx, cy, time) => {
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 3; i++) {
      const o = BAT_OFFSETS[i];
      const bx = cx + o.dx;
      const by = cy + o.dy;
      const sway = fastSin(time * 1.2 + i);
      ctx.fillStyle = '#1a1422';
      ctx.beginPath();
      ctx.ellipse(bx + sway, by + 4, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx - 3 + sway, by + 2);
      ctx.quadraticCurveTo(bx + sway, by + 6, bx + 3 + sway, by + 2);
      ctx.fill();
      ctx.fillStyle = '#ff7c2e';
      ctx.fillRect(bx - 0.5 + sway, by + 5, 1, 1);
    }
    ctx.globalAlpha = 1;
  },
  crow: (ctx, cx, cy, time) => {
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) {
      const o = CROW_OFFSETS[i];
      const px = cx + o.dx;
      const py = cy + o.dy;
      ctx.fillStyle = '#0e0a14';
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 4, py - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a1c';
      ctx.beginPath();
      ctx.moveTo(px + 6, py - 3);
      ctx.lineTo(px + 9, py - 2.5);
      ctx.lineTo(px + 6, py - 2);
      ctx.fill();
      if (fastSin(time * 3 + i * 2) > 0.6) {
        ctx.fillStyle = '#0e0a14';
        ctx.beginPath();
        ctx.arc(px + 4, py - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
  bird: (ctx, cx, cy, time) => {
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 4; i++) {
      const offset = BIRD_OFFSETS[i];
      const px = cx + offset.dx;
      const py = cy + offset.dy;
      const color = BIRD_PALETTE[i % BIRD_PALETTE.length];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(px, py, 3.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 2.5, py - 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8a3a';
      ctx.fillRect(px + 4, py - 2, 1, 1);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px - 3, py);
      ctx.lineTo(px - 5, py - 1);
      ctx.lineTo(px - 5, py + 1);
      ctx.fill();
      if (fastSin(time * 5 + i * 1.7) > 0.85) {
        ctx.fillStyle = '#000';
        ctx.fillRect(px + 2.5, py - 2, 0.5, 0.5);
      }
    }
    ctx.globalAlpha = 1;
  },
};

interface FlyingSpeciesCfg { color: string | null; bodyW: number; bodyH: number; wingSpan: number; flapFreq: number; flapAmp: number; }
const FLYING_CFG: Record<ScatterFlockSpecies, FlyingSpeciesCfg> = {
  bat:  { color: '#1a1422', bodyW: 0,   bodyH: 0,   wingSpan: 5, flapFreq: 32, flapAmp: 4 },
  crow: { color: '#0e0a14', bodyW: 4,   bodyH: 3,   wingSpan: 9, flapFreq: 24, flapAmp: 5 },
  bird: { color: null,      bodyW: 3,   bodyH: 2.5, wingSpan: 6, flapFreq: 28, flapAmp: 4 },
};

type ScatterParticle = { x: number; y: number; vx: number; vy: number; life: number; phase: number };

export function drawScatterFlock(
  ctx: CanvasRenderingContext2D,
  flock: {
    species: ScatterFlockSpecies;
    x: number; y: number;
    active: boolean;
    scatterParticles: ScatterParticle[];
  },
  time: number,
): void {
  if (!flock.active && flock.scatterParticles.length === 0) return;
  ctx.save();
  if (flock.active) PERCHED_FLOCK_DRAWERS[flock.species](ctx, flock.x, flock.y, time);
  for (const sp of flock.scatterParticles) drawFlyingScatter(ctx, flock.species, sp);
  ctx.restore();
}

function drawFlyingScatter(ctx: CanvasRenderingContext2D, species: ScatterFlockSpecies, sp: ScatterParticle): void {
  const cfg = FLYING_CFG[species];
  const flap = fastSin(sp.life * cfg.flapFreq + sp.phase) * cfg.flapAmp;
  ctx.globalAlpha = Math.min(1, sp.life) * 0.85;
  const color = cfg.color ?? BIRD_PALETTE[Math.floor(sp.phase * 1.7) % BIRD_PALETTE.length];
  ctx.fillStyle = color;
  if (species === 'bat') {
    ctx.beginPath();
    ctx.moveTo(sp.x - 5, sp.y);
    ctx.quadraticCurveTo(sp.x - 2, sp.y - flap, sp.x, sp.y);
    ctx.quadraticCurveTo(sp.x + 2, sp.y - flap, sp.x + 5, sp.y);
    ctx.lineTo(sp.x + 4, sp.y + 1.5);
    ctx.lineTo(sp.x, sp.y + 0.5);
    ctx.lineTo(sp.x - 4, sp.y + 1.5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y, cfg.bodyW, cfg.bodyH, 0, 0, Math.PI * 2);
    ctx.fill();
    const innerW = species === 'crow' ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(sp.x - innerW, sp.y);
    ctx.lineTo(sp.x - cfg.wingSpan, sp.y + flap);
    ctx.lineTo(sp.x - (innerW - 1), sp.y);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sp.x + innerW, sp.y);
    ctx.lineTo(sp.x + cfg.wingSpan, sp.y + flap);
    ctx.lineTo(sp.x + (innerW - 1), sp.y);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
