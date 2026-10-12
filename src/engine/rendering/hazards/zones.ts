import { drawFineGeyser } from './geyser';
import type { ThemeConfig } from '../../themes/types';
import type { Ctx2D } from '../../types';
import { fastSin } from '../../fastMath';


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
const cachedLavaGradients = new WeakMap<object, LavaGradients>();
// Zero-G bg: per-zone strip (gradient varies by Y only). Stretched via drawImage
// instead of full-area gradient fillRect — saves ~1-3ms on a 780×480 zone.
const cachedZeroGBgStrips = new WeakMap<object, OffscreenCanvas | HTMLCanvasElement>();
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
  ctx: Ctx2D,
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
      const sctx = bodyStrip.getContext('2d')! as Ctx2D;
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
      const hctx = haloImage.getContext('2d')! as Ctx2D;
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
  ctx: Ctx2D,
  zone: { x: number; y: number; width: number; height: number },
  time: number,
  background?: CanvasImageSource,
  backgroundScale = 1,
): void {
  ctx.save();

  // Pulsing background fill — gradient baked into a 1×height strip.
  ctx.save();
  ctx.beginPath();
  ctx.rect(zone.x + 3, zone.y + 3, zone.width - 6, zone.height - 6);
  ctx.clip();
  if (background) {
    // Source coordinates use backing-store pixels; destination stays logical.
    for (let y = 3; y < zone.height - 3; y += 6) {
      const shift = Math.sin(y / zone.height * Math.PI * 4 - time * 0.65) * 0.75;
      ctx.drawImage(background,
        (zone.x - 16) * backgroundScale, (zone.y + y) * backgroundScale,
        (zone.width + 32) * backgroundScale, 6 * backgroundScale,
        zone.x - 16 + shift, zone.y + y, zone.width + 32, 6);
    }
  }
  ctx.strokeStyle = 'rgba(112,223,255,0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 20; j++) {
      const x = zone.x + i * zone.width / 6 + Math.sin(j * 0.4 + time * 0.4) * 5;
      const y = zone.y + j * zone.height / 20;
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 24; j++) {
      const x = zone.x + j * zone.width / 24;
      const y = zone.y + i * zone.height / 4 + Math.sin(j * 0.3 - time * 0.4) * 4;
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();

  ctx.globalAlpha = 0.1 + fastSin(time * 1.5) * 0.04;
  let bgStrip = cachedZeroGBgStrips.get(zone as object);
  if (!bgStrip) {
    const useOffscreen = typeof OffscreenCanvas !== 'undefined';
    bgStrip = useOffscreen
      ? new OffscreenCanvas(1, zone.height)
      : (() => { const c = document.createElement('canvas'); c.width = 1; c.height = zone.height; return c; })();
    const sctx = bgStrip.getContext('2d')! as Ctx2D;
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

const currentWaterGradients = new WeakMap<Ctx2D, WeakMap<object, CanvasGradient>>();

export function drawCurrentZone(
  ctx: Ctx2D,
  zone: { x: number; y: number; width: number; height: number; vx?: number; vy?: number },
  time: number,
  visualTop?: number,
): void {
  ctx.save();

  // Vertical waterfall current
  if (zone.vy && Math.abs(zone.vy) > Math.abs(zone.vx || 0)) {
    const zx=zone.x, zy=visualTop??zone.y, zw=zone.width, zh=zone.y+zone.height-zy;
    ctx.translate(zx,zy);
    ctx.beginPath();ctx.moveTo(0,0);
    for(let k=0;k<=zh;k+=12)ctx.lineTo(Math.sin(k*.025-time*2)*5,k);
    ctx.lineTo(zw,zh);
    for(let k=zh;k>=0;k-=12)ctx.lineTo(zw+Math.sin(k*.03-time*2+2)*5,k);
    ctx.closePath();ctx.clip();
    let byZone=currentWaterGradients.get(ctx);if(!byZone){byZone=new WeakMap();currentWaterGradients.set(ctx,byZone);}
    let water=byZone.get(zone);if(!water){water=ctx.createLinearGradient(0,0,zw,0);
    water.addColorStop(0,'rgba(39,115,153,.65)');water.addColorStop(.25,'rgba(103,182,209,.62)');
    water.addColorStop(.6,'rgba(159,216,225,.7)');water.addColorStop(1,'rgba(50,130,172,.65)');byZone.set(zone,water);}
    ctx.fillStyle=water;ctx.fillRect(-8,0,zw+16,zh);
    for(let j=0;j<10;j++){
      const yy=((time*210+j*83)%(zh+100))-80;
      ctx.beginPath();ctx.moveTo(-10,yy);
      for(let x=0;x<=zw+10;x+=15)ctx.lineTo(x,yy+Math.sin(x*.04+j)*17);
      for(let x=zw+10;x>=-10;x-=15)ctx.lineTo(x,yy+40+Math.sin(x*.035+j+1)*22);
      ctx.closePath();ctx.fillStyle=j%2?'rgba(211,242,234,.22)':'rgba(36,111,152,.23)';ctx.fill();
    }
    ctx.beginPath();ctx.moveTo(-6,zh+4);
    for(let x=-6;x<=zw+6;x+=6)ctx.lineTo(x,zh-10-Math.abs(Math.sin(x*.055+time*5))*14-Math.sin(x*.13+time*3)*5);
    ctx.lineTo(zw+6,zh+7);ctx.closePath();ctx.fillStyle='rgba(218,245,236,.65)';ctx.fill();
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
  ctx: Ctx2D,
  zone: { x: number; y: number; width: number; height: number },
  gs: { active: boolean; activeTimer: number },
  time: number,
): void {
  drawFineGeyser(ctx, zone, gs.active, time);
}

export function drawBouncyPlatformOverlay(
  ctx: Ctx2D,
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
