import type { Ctx2D, Platform } from '../../../src/engine/types';
import { CAP_DEPTH, capFrontY, skewPx } from '../../../src/engine/themes/drawPrimitives';

// Hand-built vector material study. All marks are in logical pixels; increasing
// the canvas backing scale keeps the ink intact, including on forty-pixel steps.
type Point = readonly [number, number];
const ink = '#335567';

function random(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function polygon(ctx: Ctx2D, points: Point[], fill: string): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function line(ctx: Ctx2D, points: Point[], color: string, width: number): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function paint(ctx: Ctx2D, p: Platform, ground: boolean): void {
  const cube = p.style === 'iceCube';
  const small = p.width < 80 && !cube;
  const bridge = ground || p.style === 'snowBridge';
  const extra = ground ? 24 : 0;
  const x = p.x - extra;
  const w = p.width + (cube ? p.width * .3 : skewPx()) + extra * 2;
  const top = p.y - (cube ? p.width * .15 : CAP_DEPTH / 2);
  const bottom = p.y + p.height;
  const h = bottom - top;
  const side = cube ? 13 : small ? 5 : 9;
  const faceEnd = w - side;
  const snowDepth = small ? 8.5 : cube ? 18 : ground ? 31 : 14;
  const r = random(Math.round(p.x * 17 + p.y * 31 + p.width * 101 + p.height * 43));
  const cells: { a: number; b: number; apex: number; low: number; mid: number }[] = [];
  let a = 0;
  while (a < faceEnd) {
    const desired = small ? 9 + r() * 9 : cube ? 21 + r() * 20 : ground ? 68 + r() * 92 : bridge ? 22 + r() * 29 : 11 + r() * 17;
    const b = Math.min(faceEnd, a + desired);
    cells.push({ a, b, apex: a + (b - a) * (.2 + r() * .6), low: h - 1.8 - r() * (small ? 1.3 : 3.8), mid: snowDepth + (h - snowDepth) * (.15 + r() * .7) });
    a = b;
  }
  ctx.save();
  ctx.translate(x, top);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // A single watertight silhouette under every facet prevents seams at any DPR.
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(2, 5);
    ctx.quadraticCurveTo(w * .35, 1, w - 2, 3);
    ctx.lineTo(w - 1, h - (cube ? 7 : 6));
    ctx.quadraticCurveTo(w - 3, h - 1, faceEnd, h - 1);
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      ctx.lineTo(c.apex, c.low);
      ctx.lineTo(c.a + 1, h - 2.5);
    }
    ctx.quadraticCurveTo(5, h - 3, 3, h - 7);
    ctx.lineTo(0, 10);
    ctx.quadraticCurveTo(-1, 6, 2, 5);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = '#359bb5';
  ctx.fill();
  ctx.save();
  ctx.clip();
  polygon(ctx, [[0, snowDepth], [faceEnd, snowDepth - 2], [faceEnd, h], [0, h]], '#4faac1');
  const light = ['#7bcbd7', '#62bfd1', '#87d3dd', '#56b6cc', '#6fc7d6'];
  const dark = ['#167f9e', '#2888a5', '#378da6', '#287b98', '#20869f'];
  cells.forEach((c, i) => {
    const span = c.b - c.a;
    const crown = snowDepth - 5 + r() * 5;
    polygon(ctx, [[c.a - 1, crown], [c.apex, c.mid], [c.b + 1, crown - 2], [c.b - span * .12, c.low], [c.a, h]], dark[i % dark.length]);
    ctx.beginPath();
    ctx.moveTo(c.a + 1, c.low - 2);
    ctx.quadraticCurveTo(c.a + span * .09, crown - 4, c.apex, crown + 1);
    ctx.bezierCurveTo(c.apex + span * .24, crown - 4, c.b - span * .17, c.mid - 2, c.b - span * .09, c.low);
    ctx.lineTo(c.a + span * .58, c.low - 2);
    ctx.quadraticCurveTo(c.a + span * .32, c.mid + 4, c.a + 1, c.low - 2);
    ctx.fillStyle = light[i % light.length];
    ctx.fill();
    polygon(ctx, [[c.apex, c.mid], [c.b, crown - 1], [c.b - span * .16, c.low], [c.a + span * .46, c.low]], i % 3 ? '#44a8be' : '#64becd');
    if (i % 3 === 0) polygon(ctx, [[c.a + span * .46, c.low], [c.apex + span * .12, c.mid + 2], [c.b - span * .13, c.low]], '#3b9db5');
    // Uneven, branching fracture rather than an identical triangle per cell.
    const crack: Point[] = [[c.a + 1, crown], [c.apex - .6, c.mid], [c.a + span * .46, c.low - .6]];
    if (i % 3 !== 1) line(ctx, crack, '#c1e9ed', small ? .65 : .85);
    if (i % 3 !== 1) {
      line(ctx, [[c.apex - .5, c.mid], [c.apex + span * .19, c.mid + 2], [c.b - 1, crown]], '#a6e1e5', small ? .5 : .75);
    }
    if (!small && span > 14) {
      // Dry-brush streaks cluster along one fracture, leaving broad quiet facets.
      const count = ground ? 130 : cube ? 85 : 42;
      for (let j = 0; j < count; j++) {
        const t = r();
        const yy = crown + 2 + t * Math.max(1, c.low - crown - 3);
        const xx = c.a + span * (.06 + .17 * t) + r() * span * .64;
        const length = .35 + r() * (ground ? 3.4 : 2.1);
        line(ctx, [[xx, yy], [xx + length, yy - .2 - r() * .9]], j % 5 ? 'rgba(213,247,247,.62)' : 'rgba(17,95,129,.28)', .4 + r() * .55);
      }
      line(ctx, [[c.b - span * .19, c.low - 2], [c.b - span * .25, c.low - 5]], 'rgba(217,246,244,.65)', .6);
    }
  });
  if (cube) {
    // Broad oblique slabs cross the vertical grain of a block. This makes the
    // volume read as broken glacier ice rather than a row of upright crystals.
    const cy = snowDepth + (h - snowDepth) * .49;
    polygon(ctx, [[2, cy + 5], [faceEnd * .29, cy - 10], [faceEnd * .51, cy + 6], [faceEnd * .83, cy - 7], [faceEnd - 1, cy + 1], [faceEnd * .62, cy + 18], [faceEnd * .33, cy + 7], [11, h - 4]], 'rgba(42,153,180,.72)');
    line(ctx, [[3, cy + 5], [faceEnd * .29, cy - 10], [faceEnd * .51, cy + 6], [faceEnd * .83, cy - 7]], '#b6e5e8', 1.15);
    line(ctx, [[faceEnd * .51, cy + 6], [faceEnd * .33, h - 4]], '#a1dce3', .85);
    for (let j = 0; j < 65; j++) {
      const xx = 5 + r() * (faceEnd - 12);
      const yy = cy - 5 + r() * (h - cy + 1);
      line(ctx, [[xx, yy], [xx + .5 + r() * 2.2, yy - r()]], 'rgba(210,248,246,.62)', .5);
    }
  }
  // Right return plane, continuous with the front mass and tucked under snow.
  polygon(ctx, [[faceEnd, snowDepth - 2], [w + 1, 5], [w, h - 5], [faceEnd - 1, h]], '#276a88');
  polygon(ctx, [[faceEnd + 3, snowDepth], [w - 2, 8], [w - 4, h - 7], [faceEnd + 3, h - 3]], '#3f97b1');
  line(ctx, [[faceEnd + 1, snowDepth + 2], [faceEnd - 1, h - 2]], '#a0d8df', .8);
  line(ctx, [[w - 3, snowDepth + 4], [faceEnd + 4, h - 10], [w - 3, h - 6]], '#76bfce', .7);
  ctx.restore();
  body();
  ctx.strokeStyle = ink;
  ctx.lineWidth = small ? 1.1 : .9;
  ctx.stroke();

  // The draped snow is one closed path. Lobes have different widths and depths,
  // with shallow hanging folds; the top stays close to the collision plane.
  const lobes: { start: number; end: number; dip: number }[] = [];
  a = 2;
  while (a < faceEnd) {
    const b = Math.min(faceEnd, a + (small ? 7 + r() * 8 : ground ? 28 + r() * 48 : 10 + r() * 15));
    lobes.push({ start: a, end: b, dip: snowDepth + (r() > .72 ? 3.3 : -1) + r() * (ground ? 6 : 2) });
    a = b;
  }
  const snow = () => {
    ctx.beginPath();
    ctx.moveTo(1, 7);
    ctx.quadraticCurveTo(0, 2, Math.min(10, w * .16), 1.7);
    const topCount = Math.max(2, Math.ceil(w / (ground ? 67 : 23)));
    for (let i = 1; i <= topCount; i++) {
      const sx = 8 + (w - 12) * (i - 1) / topCount;
      const ex = 8 + (w - 12) * i / topCount;
      ctx.quadraticCurveTo((sx + ex) / 2, i % 3 === 0 ? 3 : -.4, ex, i % 2 ? 1.8 : 1);
    }
    ctx.quadraticCurveTo(w + 1, 1, w - 1, 6);
    ctx.quadraticCurveTo(w - 3, 9, faceEnd, snowDepth - 1);
    for (let i = lobes.length - 1; i >= 0; i--) {
      const l = lobes[i];
      const span = l.end - l.start;
      ctx.bezierCurveTo(l.end - span * .2, snowDepth - 3, l.end - span * .12, l.dip + 1, l.start + span * .47, l.dip);
      ctx.bezierCurveTo(l.start + span * .18, l.dip, l.start + span * .21, snowDepth - 2, l.start, snowDepth - 1);
    }
    ctx.quadraticCurveTo(-1, snowDepth + 1, 1, 7);
    ctx.closePath();
  };
  snow();
  ctx.fillStyle = '#f6f8f0';
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = small ? 1.05 : .85;
  ctx.stroke();
  ctx.save();
  snow();
  ctx.clip();
  lobes.forEach((l, i) => {
    ctx.beginPath();
    ctx.moveTo(l.start - 1, snowDepth - 1);
    ctx.quadraticCurveTo((l.start + l.end) / 2, l.dip + 4, l.end + 1, snowDepth - 1);
    ctx.strokeStyle = i % 2 ? '#c1d8dc' : '#ccdde0';
    ctx.lineWidth = small ? 2 : 4.4;
    ctx.stroke();
    if (!small) {
      for (let j = 0; j < (ground ? 38 : 13); j++) {
        const xx = l.start + r() * (l.end - l.start);
        const yy = snowDepth - 1 - r() * (ground ? 11 : 6);
        line(ctx, [[xx, yy], [xx + 1 + r() * 2, yy - .4]], 'rgba(152,181,193,.38)', .55);
      }
    }
  });
  // A few snow ripples hint at the top plane without striping the landing cue.
  if (!small) {
    const rippleCount = Math.max(1, Math.floor(w / 55));
    for (let i = 0; i < rippleCount; i++) {
      const xx = 10 + r() * (w - 25);
      const yy = 3 + r() * Math.max(1, snowDepth - 9);
      line(ctx, [[xx, yy], [xx + 3, yy + .55], [xx + 7 + r() * 5, yy]], 'rgba(174,198,204,.5)', .55);
    }
  }
  ctx.restore();
  ctx.restore();
}

export function drawVectorReplicaBack(ctx: Ctx2D, platform: Platform, isGround: boolean): void {
  paint(ctx, platform, isGround);
}

export function drawVectorReplicaFront(ctx: Ctx2D, platform: Platform, isGround: boolean): void {
  if (platform.style === 'iceCube') return;
  ctx.save();
  ctx.beginPath();
  const extra = isGround ? 24 : 0;
  const front = capFrontY(platform);
  ctx.rect(platform.x - extra - 2, front, platform.width + skewPx() + extra * 2 + 4,
    Math.max(0, platform.y + platform.height - front + 2));
  ctx.clip();
  paint(ctx, platform, isGround);
  ctx.restore();
}
