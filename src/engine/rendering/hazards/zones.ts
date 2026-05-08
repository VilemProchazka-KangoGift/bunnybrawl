import type { ThemeConfig } from '../../themes/types';
import { fastSin } from '../../fastMath';
import { getSlowDevice } from '../../perfFlags';

// Gradient caches keyed by the hz/zone object identity — arena objects are
// stable for the match lifetime, so a WeakMap avoids per-frame string-key
// allocation. Cleared via clearZoneCaches() on theme/arena change.
type LavaGradients = {
  bodyStrip: OffscreenCanvas | HTMLCanvasElement;
  bodyHeight: number;
  // Halo baked into a 2D image (radial gradient varies in both dimensions, so
  // strip pattern doesn't apply). Drawn via drawImage instead of fillRect with
  // gradient — saves the per-pixel radial evaluation over ~60k+ pixels/zone.
  haloImage: OffscreenCanvas | HTMLCanvasElement;
  haloW: number;
  haloH: number;
};
// Vertical waterfall current: water body baked to a 1×N image strip; full-width
// fill of a custom wavy path uses clip + stretched drawImage instead of a
// per-pixel CanvasGradient (which was costing ~5ms/frame on a full-canvas fill).
type CurrentImages = {
  waterStrip: OffscreenCanvas | HTMLCanvasElement;
  // Horizontal highlight gradient baked to a 60×1 strip (varies in X only,
  // stretched in Y at draw via drawImage + imageSmoothingEnabled=false). Skips
  // the per-pixel CanvasGradient evaluation over ~36k pixels/frame.
  highlightStrip: OffscreenCanvas | HTMLCanvasElement;
  height: number;
};
const cachedLavaGradients = new WeakMap<object, LavaGradients>();
// Zero-G bg: per-zone strip (gradient varies by Y only). Stretched via drawImage
// instead of full-area gradient fillRect — saves ~1-3ms on a 780×480 zone.
const cachedZeroGBgStrips = new WeakMap<object, OffscreenCanvas | HTMLCanvasElement>();
const cachedCurrentImages = new WeakMap<object, CurrentImages>();
const cachedJellyGradients = new WeakMap<object, CanvasGradient>();

// Hoisted dash patterns — setLineDash takes a fresh array otherwise.
const ZEROG_DASH: number[] = [8, 5];
const NO_DASH: number[] = [];

export function clearZoneCaches(): void {
  // All caches are WeakMaps; entries drop when their key references go away
  // (arena change). Nothing to explicitly clear — the function exists for
  // symmetry with other category modules and as a forward-compatible hook
  // if a non-WeakMap cache is added later.
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

    // Lava body strip (vertical gradient) + halo (radial, uncached fillRect).
    let cachedLava = cachedLavaGradients.get(hz as object);
    if (!cachedLava) {
      const useOffscreen = typeof OffscreenCanvas !== 'undefined';
      const bodyStrip = useOffscreen
        ? new OffscreenCanvas(1, hz.height)
        : (() => { const c = document.createElement('canvas'); c.width = 1; c.height = hz.height; return c; })();
      const sctx = bodyStrip.getContext('2d') as CanvasRenderingContext2D;
      const bodyG = sctx.createLinearGradient(0, 0, 0, hz.height);
      bodyG.addColorStop(0, '#FF6600');
      bodyG.addColorStop(0.5, '#FF4400');
      bodyG.addColorStop(1, '#CC2200');
      sctx.fillStyle = bodyG;
      sctx.fillRect(0, 0, 1, hz.height);
      // Halo: bake the radial gradient into a 2D image at half-resolution
      // (gradient is smooth; nearest-neighbor upscale on draw is invisible).
      const haloW = Math.ceil(hz.width * 1.6);
      const haloH = Math.ceil(hz.height * 3);
      const haloBakeW = Math.max(2, Math.ceil(haloW / 2));
      const haloBakeH = Math.max(2, Math.ceil(haloH / 2));
      const haloImage = useOffscreen
        ? new OffscreenCanvas(haloBakeW, haloBakeH)
        : (() => { const c = document.createElement('canvas'); c.width = haloBakeW; c.height = haloBakeH; return c; })();
      const hctx = haloImage.getContext('2d') as CanvasRenderingContext2D;
      const haloG = hctx.createRadialGradient(haloBakeW / 2, haloBakeH / 2, 1, haloBakeW / 2, haloBakeH / 2, haloBakeW * 0.5);
      haloG.addColorStop(0, 'rgba(255, 100, 0, 0.3)');
      haloG.addColorStop(1, 'rgba(255, 60, 0, 0)');
      hctx.fillStyle = haloG;
      hctx.fillRect(0, 0, haloBakeW, haloBakeH);
      cachedLava = { bodyStrip, bodyHeight: hz.height, haloImage, haloW, haloH };
      cachedLavaGradients.set(hz as object, cachedLava);
    }
    // Clip to ellipse + drawImage strip stretched horizontally (gradient varies
    // by Y only, so X-stretching is free).
    ctx.beginPath();
    ctx.ellipse(cx, cy, hz.width / 2, hz.height / 2, 0, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cachedLava.bodyStrip, hz.x, hz.y, hz.width, hz.height);
    ctx.restore();

    // Bright center (pulsing)
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#FFCC33';
    ctx.beginPath();
    ctx.ellipse(cx, cy, hz.width * 0.3, hz.height * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glow halo (cached as 2D image, drawn via drawImage instead of gradient fillRect).
    ctx.globalAlpha = 0.15 + fastSin(time * 2) * 0.05;
    ctx.drawImage(cachedLava.haloImage, hz.x - hz.width * 0.3, hz.y - hz.height, cachedLava.haloW, cachedLava.haloH);

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

export function drawZeroGZone(
  ctx: CanvasRenderingContext2D,
  zone: { x: number; y: number; width: number; height: number },
  time: number,
): void {
  ctx.save();

  // Pulsing background fill — gradient baked into a 1×height strip.
  ctx.globalAlpha = 0.1 + fastSin(time * 1.5) * 0.04;
  let bgStrip = cachedZeroGBgStrips.get(zone as object);
  if (!bgStrip) {
    const useOffscreen = typeof OffscreenCanvas !== 'undefined';
    bgStrip = useOffscreen
      ? new OffscreenCanvas(1, zone.height)
      : (() => { const c = document.createElement('canvas'); c.width = 1; c.height = zone.height; return c; })();
    const sctx = bgStrip.getContext('2d') as CanvasRenderingContext2D;
    const g = sctx.createLinearGradient(0, 0, 0, zone.height);
    g.addColorStop(0, 'rgba(0, 180, 255, 0.2)');
    g.addColorStop(0.5, 'rgba(0, 220, 255, 0.08)');
    g.addColorStop(1, 'rgba(0, 180, 255, 0.2)');
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, 1, zone.height);
    cachedZeroGBgStrips.set(zone as object, bgStrip);
  }
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bgStrip, zone.x, zone.y, zone.width, zone.height);
  ctx.imageSmoothingEnabled = prevSmooth;

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

    // Water body baked to a 1×height strip image (cached by zone identity).
    // Stretched via drawImage inside a clipped wavy-edge path — avoids the
    // per-pixel CanvasGradient lookup over a 200k+ pixel area.
    let cachedImages = cachedCurrentImages.get(zone as object);
    if (!cachedImages) {
      const useOffscreen = typeof OffscreenCanvas !== 'undefined';
      const strip = useOffscreen
        ? new OffscreenCanvas(1, zh)
        : (() => { const c = document.createElement('canvas'); c.width = 1; c.height = zh; return c; })();
      const sctx = strip.getContext('2d') as CanvasRenderingContext2D;
      const water = sctx.createLinearGradient(0, 0, 0, zh);
      water.addColorStop(0, 'rgba(140, 200, 240, 0.45)');
      water.addColorStop(0.3, 'rgba(100, 180, 230, 0.4)');
      water.addColorStop(1, 'rgba(70, 150, 210, 0.35)');
      sctx.fillStyle = water;
      sctx.fillRect(0, 0, 1, zh);
      // Highlight gradient varies in X only (60px wide). Bake to a 60×1 strip
      // — drawImage stretches vertically at no per-pixel cost (memcpy + blend).
      const HIGHLIGHT_W = 60;
      const highlightStrip = useOffscreen
        ? new OffscreenCanvas(HIGHLIGHT_W, 1)
        : (() => { const c = document.createElement('canvas'); c.width = HIGHLIGHT_W; c.height = 1; return c; })();
      const hlctx = highlightStrip.getContext('2d') as CanvasRenderingContext2D;
      const highlight = hlctx.createLinearGradient(0, 0, HIGHLIGHT_W, 0);
      highlight.addColorStop(0, 'rgba(255,255,255,0)');
      highlight.addColorStop(0.5, 'rgba(255,255,255,1)');
      highlight.addColorStop(1, 'rgba(255,255,255,0)');
      hlctx.fillStyle = highlight;
      hlctx.fillRect(0, 0, HIGHLIGHT_W, 1);
      cachedImages = { waterStrip: strip, highlightStrip, height: zh };
      cachedCurrentImages.set(zone as object, cachedImages);
    }
    // Wavy edge path → clip → drawImage of strip stretched to width.
    ctx.globalAlpha = 1;
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
    ctx.save();
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cachedImages.waterStrip, zx - 12, zy, zw + 24, zh);
    ctx.restore();

    const speed = Math.abs(zone.vy) * 0.3;
    // Slow-device skips animated layers; keeps body + center highlight.
    if (getSlowDevice()) {
      ctx.globalAlpha = 0.12;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cachedImages.highlightStrip, cx - 30, zy, 60, zh);
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
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cachedImages.highlightStrip, cx - 30, zy, 60, zh);

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
