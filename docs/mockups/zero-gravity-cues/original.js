import {fastSin} from '../../../src/engine/fastMath.ts';
const cachedZeroGBgStrips=new WeakMap();const ZEROG_DASH=[8,5],NO_DASH=[];
export function drawZeroGZone(
  ctx,
  zone,
  time,
) {
  ctx.save();

  // Pulsing background fill — gradient baked into a 1×height strip.
  ctx.globalAlpha = 0.1 + fastSin(time * 1.5) * 0.04;
  let bgStrip = cachedZeroGBgStrips.get(zone);
  if (!bgStrip) {
    const useOffscreen = typeof OffscreenCanvas !== 'undefined';
    bgStrip = useOffscreen
      ? new OffscreenCanvas(1, zone.height)
      : (() => { const c = document.createElement('canvas'); c.width = 1; c.height = zone.height; return c; })();
    const sctx = bgStrip.getContext('2d');
    const g = sctx.createLinearGradient(0, 0, 0, zone.height);
    g.addColorStop(0, 'rgba(0, 180, 255, 0.2)');
    g.addColorStop(0.5, 'rgba(0, 220, 255, 0.08)');
    g.addColorStop(1, 'rgba(0, 180, 255, 0.2)');
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, 1, zone.height);
    cachedZeroGBgStrips.set(zone, bgStrip);
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

