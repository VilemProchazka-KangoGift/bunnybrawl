import type { Ctx2D } from '../../types';
import { fastSin } from '../../fastMath';

// Meadow-only details: preserve the shared decorations' footprints and bends.
// Broad shapes carry the illustration; no gradients or per-draw data allocation.
const TAU = Math.PI * 2;
const INK = '#334937';
const SHADE = '#31523c';
const GREEN = '#6d8c4c';
const LIGHT = '#a3b966';
const CREAM = '#f2e8bd';
const PUFF_DIRECTIONS = new Float32Array(16);
for (let i = 0; i < 8; i++) {
  PUFF_DIRECTIONS[i * 2] = Math.cos(i * TAU / 8);
  PUFF_DIRECTIONS[i * 2 + 1] = Math.sin(i * TAU / 8);
}

function oval(c: Ctx2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0): void {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, TAU); c.fill();
}

// Pointed, asymmetric leaf with one vein. Coordinates avoid a save/rotate per leaf.
function leaf(c: Ctx2D, x: number, y: number, dx: number, dy: number, color: string): void {
  c.fillStyle = color; c.strokeStyle = INK; c.lineWidth = .8;
  c.beginPath(); c.moveTo(x, y);
  c.bezierCurveTo(x + dx * .15 - dy * .3, y + dy * .15 + dx * .3,
    x + dx * .7 - dy * .28, y + dy * .7 + dx * .28, x + dx, y + dy);
  c.quadraticCurveTo(x + dx * .62 + dy * .32, y + dy * .62 - dx * .32, x, y);
  c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * .75, y + dy * .75); c.stroke();
}

export function drawMeadowTree(c: Ctx2D, x: number, groundY: number, size: number): void {
  c.save(); c.translate(x, groundY); c.scale(size / 50, size / 50);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 1.4; c.strokeStyle = INK;
  c.fillStyle = '#ad7953';
  c.beginPath(); c.moveTo(-7, 0); c.quadraticCurveTo(-3, -17, -6, -36);
  c.lineTo(5, -37); c.quadraticCurveTo(3, -18, 7, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#73503a'; c.beginPath(); c.moveTo(2, -34); c.lineTo(5, -35);
  c.quadraticCurveTo(3, -15, 7, 0); c.lineTo(3, 0); c.closePath(); c.fill();
  c.strokeStyle = '#dfb68a'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-2, -3); c.quadraticCurveTo(-4, -16, -2, -26); c.stroke();
  // One continuous crown, asymmetrical lobes and a dark underskirt.
  c.fillStyle = SHADE; c.strokeStyle = INK; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(-25, -17);
  c.quadraticCurveTo(-31, -25, -23, -30); c.quadraticCurveTo(-28, -38, -16, -40);
  c.quadraticCurveTo(-17, -48, -7, -48); c.quadraticCurveTo(-2, -57, 7, -51);
  c.quadraticCurveTo(17, -54, 18, -43); c.quadraticCurveTo(28, -41, 24, -33);
  c.quadraticCurveTo(32, -25, 25, -18); c.quadraticCurveTo(18, -12, 9, -15);
  c.quadraticCurveTo(0, -10, -7, -15); c.quadraticCurveTo(-18, -11, -25, -17);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = GREEN; c.beginPath(); c.moveTo(-23, -29);
  c.quadraticCurveTo(-24, -36, -14, -38); c.quadraticCurveTo(-15, -45, -5, -45);
  c.quadraticCurveTo(0, -53, 7, -48); c.quadraticCurveTo(15, -50, 15, -40);
  c.quadraticCurveTo(25, -38, 21, -31); c.quadraticCurveTo(28, -25, 18, -22);
  c.quadraticCurveTo(10, -25, 5, -21); c.quadraticCurveTo(-4, -17, -10, -23);
  c.quadraticCurveTo(-20, -21, -23, -29); c.closePath(); c.fill();
  leaf(c, -13, -35, 8, -7, LIGHT); leaf(c, -5, -43, 10, -3, LIGHT);
  leaf(c, 10, -32, 9, -6, LIGHT); leaf(c, -18, -25, 8, -2, GREEN);
  leaf(c, 1, -25, 8, -6, LIGHT);
  c.restore();
}

export function drawMeadowGrassTuft(c: Ctx2D, x: number, groundY: number): void {
  c.save(); c.strokeStyle = INK; c.lineWidth = .8;
  for (let i = 0; i < 3; i++) {
    const bx = x + (i - 1) * 3, dx = (i - 1) * 3, h = i === 1 ? 10 : 7;
    c.fillStyle = i === 1 ? LIGHT : GREEN;
    c.beginPath(); c.moveTo(bx - 1.5, groundY);
    c.quadraticCurveTo(bx + dx * .3 - 2, groundY - h * .7, bx + dx, groundY - h);
    c.quadraticCurveTo(bx + dx * .2, groundY - h * .4, bx + 1.5, groundY);
    c.closePath(); c.fill(); c.stroke();
  }
  c.restore();
}

export function drawMeadowLeafCluster(c: Ctx2D, x: number, groundY: number): void {
  c.save(); leaf(c, x, groundY, -14, -6, GREEN);
  leaf(c, x, groundY, 13, -7, GREEN); leaf(c, x, groundY, -2, -12, LIGHT); c.restore();
}

export function drawMeadowHangingVine(c: Ctx2D, x: number, topY: number, length: number, bendX = 0): void {
  c.save(); c.strokeStyle = INK; c.lineWidth = 1.4;
  const sway = Math.sin(x * .1) * 4;
  const ctrl = sway + bendX * .7, tip = sway * .5 + bendX;
  c.beginPath(); c.moveTo(x, topY); c.quadraticCurveTo(x + ctrl, topY + length * .6, x + tip, topY + length); c.stroke();
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) * .25;
    // Exact point on the stem's quadratic: leaves stay attached during parting.
    const lx = x + 2 * (1 - t) * t * ctrl + t * t * tip;
    const ly = topY + 2 * (1 - t) * t * length * .6 + t * t * length;
    leaf(c, lx, ly, i % 2 ? 8 : -8, 3, i % 2 ? LIGHT : GREEN);
  }
  c.restore();
}

export function drawMeadowFern(c: Ctx2D, x: number, groundY: number, bendX = 0): void {
  c.save(); c.strokeStyle = INK; c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(x, groundY);
  c.quadraticCurveTo(x + 2 + bendX * .5, groundY - 11, x + 4 + bendX, groundY - 22); c.stroke();
  for (let i = 0; i < 4; i++) {
    const t = (5 + i * 4) / 22, stemX = x + (4 + bendX) * t;
    const fy = groundY - t * 22, len = 10 - i * 1.5;
    leaf(c, stemX, fy, -len, -3, GREEN); leaf(c, stemX, fy, len, -4, LIGHT);
  }
  c.restore();
}

export function drawMeadowTallGrass(c: Ctx2D, x: number, groundY: number, bladeCount: number, bendX = 0): void {
  c.save(); c.lineWidth = .8; c.strokeStyle = INK;
  for (let i = 0; i < bladeCount; i++) {
    const bx = x + (i - bladeCount / 2) * 6, h = 14 + (i * 7 % 10);
    const lean = (i % 3 - 1) * 4, tip = bx + lean + bendX, ctrl = bx + lean * .5 + bendX * .55;
    c.fillStyle = i % 2 ? LIGHT : GREEN;
    c.beginPath(); c.moveTo(bx - 1.5, groundY);
    c.quadraticCurveTo(ctrl - 2, groundY - h * .6, tip, groundY - h);
    c.quadraticCurveTo(ctrl + 1, groundY - h * .45, bx + 1.5, groundY);
    c.closePath(); c.fill(); c.stroke();
  }
  c.restore();
}

export function drawMeadowDandelion(c: Ctx2D, x: number, groundY: number, puffRadius: number): void {
  c.save(); c.strokeStyle = INK; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(x, groundY + 4); c.quadraticCurveTo(x - 1.5, groundY - 2, x, groundY - 8); c.stroke();
  leaf(c, x, groundY + 2, -5, -3, GREEN);
  if (puffRadius > .3) {
    const py = groundY - 9;
    oval(c, x, py, puffRadius, puffRadius * .93, CREAM);
    c.strokeStyle = '#988e66'; c.lineWidth = .65;
    c.beginPath(); c.ellipse(x, py, puffRadius, puffRadius * .93, 0, 0, TAU); c.stroke();
    c.strokeStyle = '#fff8dd'; c.lineWidth = .9; c.beginPath();
    for (let i = 0; i < 8; i++) {
      const dx = PUFF_DIRECTIONS[i * 2] * puffRadius, dy = PUFF_DIRECTIONS[i * 2 + 1] * puffRadius;
      c.moveTo(x + dx * .2, py + dy * .2); c.lineTo(x + dx * .9, py + dy * .9);
    }
    c.stroke(); oval(c, x, py, .8, .8, '#b5a370');
  }
  c.restore();
}

export function drawMeadowButterfly(c: Ctx2D, x: number, y: number, flap: number, color: string): void {
  c.save(); c.fillStyle = color; c.strokeStyle = INK; c.lineWidth = .7;
  const w = 1 + flap * 6;
  c.beginPath(); c.moveTo(x, y + 2);
  c.bezierCurveTo(x - w * 1.4, y + 7, x - w, y - 5, x - w * .55, y - 5);
  c.quadraticCurveTo(x - 1, y - 5, x, y - 1);
  c.quadraticCurveTo(x + 1, y - 5, x + w * .55, y - 5);
  c.bezierCurveTo(x + w, y - 5, x + w * 1.4, y + 7, x, y + 2);
  c.closePath(); c.fill(); c.stroke();
  oval(c, x - w * .55, y - 1, Math.max(.4, flap * 1.1), 1.6, CREAM);
  oval(c, x + w * .55, y - 1, Math.max(.4, flap * 1.1), 1.6, CREAM);
  c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x, y + 3); c.stroke(); c.restore();
}

export function drawMeadowBee(c: Ctx2D, x: number, y: number, wingLift = 0): void {
  c.save();
  oval(c, x - .7, y - 2 - Math.abs(wingLift) * .5, 2.1, 1.2, CREAM, -.4);
  oval(c, x, y, 3, 2.2, '#f1d56e');
  c.strokeStyle = INK; c.lineWidth = .65; c.beginPath(); c.ellipse(x, y, 3, 2.2, 0, 0, TAU); c.stroke();
  c.lineWidth = 1; c.beginPath(); c.moveTo(x - 1, y - 1.5); c.lineTo(x - 1, y + 1.5); c.stroke();
  oval(c, x + 2, y - .4, .65, .65, INK); c.restore();
}

export function drawMeadowSnail(c: Ctx2D, x: number, y: number, facingEase: number, time: number): void {
  c.save(); c.translate(x, y); if (facingEase < 0) c.scale(-1, 1);
  c.fillStyle = '#c5ad7c'; c.strokeStyle = INK; c.lineWidth = .9;
  c.beginPath(); c.moveTo(-9, 2); c.quadraticCurveTo(-6, -2, 5, -1);
  c.quadraticCurveTo(10, -4, 10, 1); c.quadraticCurveTo(4, 5, -9, 2); c.closePath(); c.fill(); c.stroke();
  oval(c, -1, -3, 5.5, 5.5, '#ad7953'); c.strokeStyle = '#61422f';
  c.beginPath(); c.arc(-1, -3, 5.5, 0, TAU); c.stroke();
  c.beginPath(); c.moveTo(3, -2);
  c.bezierCurveTo(3, -7, -5, -8, -5, -3); c.bezierCurveTo(-5, 1, 1, 1, 1, -3);
  c.quadraticCurveTo(0, -5, -2, -3); c.stroke();
  const wig = fastSin(time * 6) * .5;
  c.strokeStyle = INK; c.lineWidth = .8; c.beginPath();
  c.moveTo(7, -1); c.lineTo(10 + wig, -5); c.moveTo(8, -1); c.lineTo(11 - wig, -4); c.stroke();
  oval(c, 10 + wig, -5, .6, .6, INK); oval(c, 11 - wig, -4, .6, .6, INK); c.restore();
}
