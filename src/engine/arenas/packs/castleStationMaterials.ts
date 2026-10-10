import type { Ctx2D } from '../../types';
import type { PlatformMaterial } from './castleStationPlatforms';
type Random = () => number;
type Point = readonly [
  number,
  number
];
export type MaterialPalette = {
  ink: string;
  face: string;
  light: string;
  shade: string;
  cap: string;
  rim: string;
};
const pale: Record<PlatformMaterial, string> = {
  limestone: '#d6c9a8',
  alloy: '#f4fcff'
};
const deep: Record<PlatformMaterial, string> = {
  limestone: '#514d3c',
  alloy: '#142432'
};
function polygon(c: Ctx2D, points: Point[], fill: string): void {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}
function line(c: Ctx2D, points: Point[], color: string, width = 1): void {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}
function oval(c: Ctx2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}
function brush(c: Ctx2D, x: number, y: number, w: number, h: number, color: string, r: Random, count: number): void {
  c.fillStyle = color;
  for (let i = 0; i < count; i++)
    c.fillRect(x + r() * w, y + r() * h, .4 + r() * 2.4, .35 + r() * .65);
}
type Cell = {
  a: number;
  b: number;
  lift: number;
  depth: number;
};
function cells(w: number, min: number, max: number, r: Random): Cell[] {
  const result: Cell[] = [];
  for (let a = 0; a < w;) {
    const b = Math.min(w, a + min + r() * (max - min));
    result.push({ a, b, lift: r(), depth: r() });
    a = b;
  }
  return result;
}
/** Faces are constructed as material volumes before dry-brush detail. The
* caller clips to its continuous silhouette and repeats this in the overlay. */
export function paintMaterialFace(c: Ctx2D, x: number, y: number, w: number, h: number, material: PlatformMaterial, p: MaterialPalette, r: Random): void {
  c.save();
  c.translate(x, y);
  const dark = deep[material], highlight = pale[material];
  if (['limestone', 'brick', 'roof'].includes(material)) {
    // Mortar surrounds individually chipped blocks, with worn bevels and pits.
    c.fillStyle = dark;
    c.fillRect(0, 0, w, h);
    const brick = false, rows = Math.max(1, Math.ceil(h / (brick ? 14 : 24))), rh = h / rows;
    for (let row = 0; row < rows; row++) {
      const yy = row * rh + (material === 'limestone' && row ? (r() - .5) * 4 : 0);
      for (let a = row % 2 ? -17 : -2; a < w;) {
        const b = a + (brick ? 23 : 31) + r() * (brick ? 20 : 40), span = b - a, chip = 1 + r() * (material === 'limestone' ? 5.5 : 2.3);
        polygon(c, [[a + chip, yy + 1], [b - 4, yy + .8], [b - 1, yy + chip + 1], [b - 1.5, yy + rh - 3], [b - 4, yy + rh - 1], [a + 2, yy + rh - 1.7], [a + .7, yy + rh - 4], [a + 1, yy + 4]], r() > .45 ? p.face : p.light);
        polygon(c, [[a + 2, yy + rh - 4], [a + span * .38, yy + rh - 5], [b - 2, yy + rh - 3], [b - 4, yy + rh - 1], [a + 2, yy + rh - 1.7]], p.shade);
        line(c, [[a + chip + 1, yy + 2], [b - 5, yy + 1.8], [b - 3, yy + 3]], highlight, .85);
        line(c, [[a + 2, yy + 4], [a + 2, yy + rh - 4]], p.rim, .7);
        polygon(c, [[b - 7, yy + rh - 4], [b - 2, yy + rh - 6], [b - 3, yy + rh - 2]], dark);
        if (r() > (material === 'limestone' ? .66 : .4) && rh > 10) {
          const cx = a + span * (.35 + r() * .35);
          if (material === 'limestone')
            line(c, [[cx, yy + 2 + r() * 4], [cx + (r() - .5) * 13, yy + rh * (.2 + r() * .3)], [cx - 2 + r() * 9, yy + rh * (.5 + r() * .4)]], p.shade, .8 + r());
        }
        brush(c, a + 4, yy + 3, Math.max(1, span - 10), Math.max(1, rh - 6), 'rgba(239,218,195,.5)', r, brick ? 16 : 28);
        brush(c, a + span * .45, yy + rh * .4, span * .35, rh * .35, 'rgba(70,58,79,.25)', r, 11);
        a = b;
      }
    }
  }
  else if (material === 'alloy') {
    c.fillStyle = p.shade;
    c.fillRect(0, 0, w, h);
    for (const cell of cells(w, 48, 116, r)) {
      const span = cell.b - cell.a;
      if (span < 12)
        continue;
      const a = cell.a + 3, b = cell.b - 3, low = h - 4;
      polygon(c, [[a, 6], [a + 3, 4], [b - 3, 4], [b, 7], [b, low - 2], [b - 3, low], [a + 3, low], [a, low - 3]], dark);
      polygon(c, [[a + 1, 7], [a + 4, 5], [b - 3, 5], [b - 1, 8], [b - 1, low - 2], [a + 2, low - 1]], cell.depth > .55 ? p.face : p.light);
      line(c, [[a + 2, low - 2], [b - 3, low - 2], [b - 2, 8]], p.shade, 1.2);
      for (const px of [a + 4, b - 4]) {
        oval(c, px, 7, 1.65, 1.45, dark);
        line(c, [[px - .7, 6.6], [px + .7, 6.6]], highlight, .6);
      }
      if (span > 35) {
        for (let j = 0; j < 4; j++)
          line(c, [[b - 24 + j * 4, low - 6], [b - 26 + j * 4, low - 3]], dark, 1.3);
        line(c, [[a + 8, 7], [a + Math.min(25, span * .35), 7]], '#a1dedb', 1.6);
      }
      brush(c, a + 3, 6, span * .42, Math.max(1, h - 10), 'rgba(228,233,219,.46)', r, 15);
    }
    polygon(c, [[0, 0], [w, 0], [w - 2, 3], [2, 3]], p.light);
    polygon(c, [[0, h - 3], [w, h - 3], [w, h], [0, h]], dark);
  }
  else {
    // Interlocking mineral slabs: broad curved masses and oblique shoulders,
    // with branching fissures and local frosted/worn texture inside them.
    const bands = Math.max(1, Math.ceil(h / 38));
    for (let row = 0; row < bands; row++) {
      const yy = row * h / bands, rh = h / bands;
      for (const [i, cell] of cells(w, w < 80 ? 10 : 20, w < 80 ? 27 : 67, r).entries()) {
        const span = cell.b - cell.a, mid = cell.a + span * (.25 + cell.lift * .45), ridge = yy + rh * (.25 + cell.depth * .45);
        polygon(c, [[cell.a - 5, yy - 2], [cell.b + 4, yy + 2], [cell.b - span * .18, yy + rh + 2], [mid, yy + rh - 1], [cell.a - 3, ridge]], i % 3 ? p.shade : dark);
        c.beginPath();
        c.moveTo(cell.a - 1, yy + rh - 2);
        c.quadraticCurveTo(cell.a + span * .08, yy - 1, mid, yy + 2);
        c.bezierCurveTo(cell.b - span * .2, yy - 2, cell.b - span * .08, ridge, cell.b - span * .12, yy + rh);
        c.lineTo(mid, ridge + 3);
        c.closePath();
        c.fillStyle = i % 3 === 0 ? p.light : p.face;
        c.fill();
        polygon(c, [[mid, ridge + 1], [cell.b + 1, yy + 1], [cell.b - span * .12, yy + rh], [mid + span * .1, yy + rh - 1]], i % 2 ? p.face : p.shade);
        const crack: Point[] = [[cell.a + 2, yy + 2], [mid - 2, ridge], [mid + 3, yy + rh - 2]];
        line(c, crack, dark, 1.7);
        line(c, crack.map(([xx, y]) => [xx + .8, y - .3] as Point), highlight, .75);
        if (span > 18)
          line(c, [[mid - 2, ridge], [mid + span * .23, ridge - 3], [cell.b - 3, yy + 3]], p.light, .7);
        if (i % 3 !== 1) {
          brush(c, cell.a + span * .1, yy + rh * .25, span * .48, rh * .55, 'rgba(222,237,223,.65)', r, w < 80 ? 13 : 36);
          brush(c, mid, ridge, span * .25, Math.max(2, rh * .3), 'rgba(39,53,68,.25)', r, 12);
        }
      }
    }
  }
  if (material === 'limestone' || false) {
    for (let i = 0; i < w / 12; i++) {
      const a = r() * w, yy = r() * h, size = .8 + r() * 3;
      polygon(c, [[a, yy], [a + size, yy - 1], [a + size * 1.6, yy + size * .6], [a + 1, yy + size]], i % 3 ? p.shade : p.light);
    }
  }
  paintAtmosphere(c, w, h, material, r);
  c.restore();
}
/** Thick hanging caps and worn coping are separate connected silhouettes. */
export function paintMaterialCap(c: Ctx2D, x: number, y: number, w: number, depth: number, sp: number, material: PlatformMaterial, p: MaterialPalette, r: Random): void {
  c.save();
  c.translate(x, y);
  const min = (material === 'alloy' ? 48 : 26);
  const max = (material === 'alloy' ? 116 : 70);
  const lobes = cells(w, min, max, r);
  const path = () => {
    c.beginPath();
    c.moveTo(0, depth - 1);
    c.lineTo(sp, 1);
    c.lineTo(w + sp, 1);
    c.lineTo(w, depth);
    for (let i = lobes.length - 1; i >= 0; i--) {
      const l = lobes[i], span = l.b - l.a;
      {
        c.lineTo(l.b - span * .16, depth + l.depth * 1.8);
        c.lineTo(l.a + span * .4, depth + .4);
        c.lineTo(l.a, depth);
      }
    }
    c.quadraticCurveTo(-1.5, depth + 1, 0, depth - 1);
    c.closePath();
  };
  path();
  c.fillStyle = p.cap;
  c.fill();
  c.lineWidth = 1.3;
  c.strokeStyle = p.ink;
  c.stroke();
  c.save();
  path();
  c.clip();
  for (const [i, l] of lobes.entries()) {
    const span = l.b - l.a;
    {
      polygon(c, [[l.a + 1, 2], [l.b + sp - 2, 2], [l.b - 1, 12], [l.a + 2, 13]], i % 3 ? p.cap : p.light);
      polygon(c, [[l.a, 12], [l.b - 1, 12], [l.b, depth + .5], [l.a, depth + .5]], p.shade);
      line(c, [[l.a + 3, 3], [l.b + sp - 4, 3]], pale[material], 1);
      line(c, [[l.a + sp, 1], [l.a, depth - 1]], p.ink, .8);
      line(c, [[l.a + sp + 1.2, 2], [l.a + 1.2, 12]], p.rim, .7);
      brush(c, l.a + 4, 5, Math.max(1, span - 5), 5, 'rgba(229,213,196,.45)', r, Math.min(23, span));
      if (material === 'alloy')
        line(c, [[l.a + 7, 9], [Math.min(l.b - 3, l.a + 24), 9]], '#91cfcd', 1.1);
    }
  }
  c.restore();
  path();
  c.strokeStyle = p.ink;
  c.lineWidth = w < 80 ? 1.25 : 1.05;
  c.stroke();
  c.restore();
}
/** Arena-specific material cues, constructed only when the static cache rebuilds. */
function paintAtmosphere(c: Ctx2D, w: number, h: number, m: PlatformMaterial, r: Random): void {
  for (const cell of cells(w, 24, 58, r)) {
    const x = (cell.a + cell.b) / 2, y = h * (.3 + r() * .45);
    if (m === 'limestone') {
      polygon(c, [[x - 9, 0], [x + 4, 0], [x + 7, 3], [x, 7], [x - 5, 5]], '#5e6950');
      line(c, [[x + 5, 0], [x + 1, h * .4], [x + 6, h * .65], [x + 3, h - 1]], '#42483a', 1.6);
      line(c, [[x + 1, h * .4], [x - 7, h * .51]], '#42483a', 1);
      oval(c, x - 6, y, 3, 1.4, '#636b55');
    }
    else if (m === 'alloy') {
      c.fillStyle = '#0e2537';
      c.fillRect(cell.a + 3, Math.max(4, h - 7), Math.max(2, cell.b - cell.a - 6), 3);
      line(c, [[cell.a + 5, Math.max(5, h - 6)], [Math.min(cell.b - 3, cell.a + 17), Math.max(5, h - 6)]], '#20e7eb', 1.5);
    }
  }
}
