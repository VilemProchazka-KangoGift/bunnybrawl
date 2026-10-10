import { paintMaterialFace, paintMaterialCap } from './castleStationMaterials';
import type { Ctx2D, Platform } from '../../types';
import { capBackY, capFrontY, skewPx, mulberry32, seedFor } from '../../themes/drawPrimitives';
export type PlatformMaterial = 'limestone' | 'alloy';
type Palette = {
  ink: string;
  face: string;
  light: string;
  shade: string;
  cap: string;
  rim: string;
};
const palettes: Record<PlatformMaterial, Palette> = {
  limestone: { ink: '#424236', face: '#817f68', light: '#aaa68a', shade: '#5b5c4e', cap: '#b9b295', rim: '#d7cdac' },
  alloy: { ink: '#101e2e', face: '#728fa4', light: '#d2e6ef', shade: '#243c54', cap: '#e0f4fa', rim: '#3bebeb' }
};
type Point = [
  number,
  number
];
function shape(c: Ctx2D, points: Point[], fill: string, ink?: string): void {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (ink) {
    c.strokeStyle = ink;
    c.stroke();
  }
}
/** Geometry only: cached by Renderer in both canvas-owning worker modes.
* The foreground repeats the same seeded painting through the existing body
* boundary. No physics data or platform collision inset is changed here.
*/
export function drawStorybookPlatform(c: Ctx2D, p: Platform, material: PlatformMaterial, front = false): void {
  const color = palettes[material];
  const x = p.x, w = p.width;
  const projection = 0;
  const bottom = p.y + p.height + projection;
  const back = capBackY(p), top = capFrontY(p), sp = skewPx();
  const h = Math.max(1, bottom - top);
  const r = mulberry32(seedFor(x, p.y) ^ Math.round(w * 97 + p.height * 53));
  // Organic overhang is contained below the landing plane. Architectural
  // caps keep their straight collision cue and the original iso projection.
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = 1.2;
  if (front) {
    c.beginPath();
    c.rect(x - 3, top, w + sp + 6, h + 3);
    c.clip();
  }
  // Connected front silhouette; broad value planes precede all small marks.
  const rough = material === 'limestone';
  const body: Point[] = [[x, top - 1], [x + w, top - 1], [x + w, bottom - 3]];
  if (rough) {
    const chunks = Math.max(2, Math.ceil(w / (39)));
    for (let i = chunks; i > 0; i--) {
      const bx = x + w * (i - .45) / chunks;
      body.push([bx, bottom - 1 - r() * 6], [x + w * (i - 1) / chunks, bottom - 2 - r() * 4]);
    }
  }
  else
    body.push([x + w, bottom - 1], [x + 2, bottom - 1]);
  body.push([x, bottom - 4]);
  shape(c, body, color.face, color.ink);
  c.save();
  c.beginPath();
  body.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py));
  c.closePath();
  c.clip();
  paintMaterialFace(c, x, top, w, h, material, color, r);
  // Restrained local flecks, never a dense repeating wallpaper.
  for (let i = 0; i < (material === 'alloy' ? 0 : Math.ceil(w / 26)); i++) {
    const px = x + 3 + r() * Math.max(1, w - 6), py = top + 3 + r() * Math.max(1, h - 6);
    c.fillStyle = i % 3 ? color.light : color.shade;
    c.fillRect(px, py, 1 + r() * 2.5, .8);
  }
  shape(c, [[x, bottom - 3], [x + w * .34, bottom - 4], [x + w * .73, bottom - 2], [x + w, bottom - 3], [x + w, bottom], [x, bottom]], color.shade);
  c.restore();
  c.lineWidth = 1.2;
  // Dark return plane and continuous contour retain the fake 3D read.
  const returnBottom = bottom - 8;
  shape(c, [[x + w, top], [x + w + sp, back], [x + w + sp, returnBottom], [x + w, bottom]], color.shade, color.ink);
  paintMaterialCap(c, x, back, w, top - back, sp, material, color, r);
  c.restore();
}
