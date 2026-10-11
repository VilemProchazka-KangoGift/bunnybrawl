import type { Ctx2D } from '../../../../src/engine/types';
import { createSpringRenderer } from '../../../../src/engine/themes/drawPrimitives';

export const GARGOYLE_VARIANTS = ['gargoyle-imp', 'gargoyle-bulldog', 'gargoyle-dragon'] as const;
export type GargoyleVariant = typeof GARGOYLE_VARIANTS[number];

const ink = '#263149';
const gold = '#f3d681';
const cream = '#f1e8d4';

function fill(c: Ctx2D, color: string) { c.fillStyle = color; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.7; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function oval(c: Ctx2D, x: number, y: number, rx: number, ry: number, color: string) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); fill(c, color);
}
function horn(c: Ctx2D, x: number, y: number, direction: number, height: number, color: string) {
  c.beginPath(); c.moveTo(x - 3, y + 2); c.quadraticCurveTo(x - direction * 1.5, y - height * .35, x + direction * 3, y - height);
  c.quadraticCurveTo(x + direction * 2.5, y - height * .25, x + 3, y + 2); c.closePath(); fill(c, color);
}
function eye(c: Ctx2D, x: number, y: number, pupil: number) {
  oval(c, x, y, 2.8, 3.1, cream);
  c.fillStyle = ink; c.beginPath(); c.arc(x + pupil, y + .5, 1.1, 0, Math.PI * 2); c.fill();
}
function wing(c: Ctx2D, side: number, top: number, span: number, color: string, open: number) {
  c.beginPath(); c.moveTo(side * 7, top + 9);
  c.quadraticCurveTo(side * (span - 2), top - 4 - open * 2, side * span, top - 6 - open * 2);
  c.lineTo(side * (span - 1), top + 8);
  c.quadraticCurveTo(side * (span - 4), top + 4, side * (span - 7), top + 11);
  c.quadraticCurveTo(side * (span - 11), top + 6, side * 7, top + 14);
  c.closePath(); fill(c, color);
  c.strokeStyle = '#bac9d4'; c.lineWidth = 1; c.beginPath(); c.moveTo(side * 8, top + 7); c.lineTo(side * (span - 2), top - 3 - open * 2); c.stroke();
}
function paws(c: Ctx2D, color: string, spread: number) {
  for (const side of [-1, 1]) {
    oval(c, side * spread, -3, 4.3, 2.7, color);
    c.strokeStyle = ink; c.lineWidth = .8; c.beginPath(); c.moveTo(side * spread, -3); c.lineTo(side * spread, -1); c.stroke();
  }
}
function base(c: Ctx2D) {
  oval(c, 0, -1.1, 14, 2.2, '#4a5f77');
  c.strokeStyle = '#c4d2d4'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-10, -2.3); c.quadraticCurveTo(0, -4, 10, -2.3); c.stroke();
}

function imp(c: Ctx2D, bounce: number) {
  const top = -22 + bounce * 5;
  const spread = 22 + bounce * 5;
  wing(c, -1, top, spread, '#637d99', bounce);
  wing(c, 1, top, spread, '#637d99', bounce);
  oval(c, 0, -11 + bounce * 2, 9.2 + bounce * 2, 10 - bounce * 2, '#879fb3');
  oval(c, -3, -13 + bounce * 2, 3.2, 5.5, '#bed0cf');
  oval(c, 0, top, 10.7, 8.3, '#9eb6c7');
  horn(c, -7, top - 5, -1, 8, '#748fa7');
  horn(c, 7, top - 5, 1, 8, '#748fa7');
  eye(c, -4.5, top - .6, .5); eye(c, 4.5, top - .6, -.5);
  oval(c, 0, top + 4, 4.7, 3, '#667b8e');
  c.fillStyle = '#a3bbc8'; c.beginPath(); c.ellipse(0, top + 3, 2.1, 1.4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = ink; c.beginPath(); c.ellipse(0, top + 7, 5.5, 2.1, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = cream; for (const dx of [-3, 3]) { c.beginPath(); c.moveTo(dx - 1, top + 6); c.lineTo(dx + 1, top + 6); c.lineTo(dx, top + 9); c.fill(); }
  paws(c, '#a4b8c1', 9);
}

function bulldog(c: Ctx2D, bounce: number) {
  const headY = -20 + bounce * 4;
  // Folded side wings and a heavy tail keep this one grounded and stubborn.
  wing(c, -1, -22 + bounce * 3, 18 + bounce * 3, '#62718f', bounce * .5);
  wing(c, 1, -22 + bounce * 3, 18 + bounce * 3, '#62718f', bounce * .5);
  oval(c, 0, -10 + bounce * 2, 11.5 + bounce * 2, 9.5 - bounce, '#7c8dab');
  oval(c, 0, headY, 13, 8.5, '#a3adc1');
  horn(c, -10, headY - 3, -1, 6, '#697992');
  horn(c, 10, headY - 3, 1, 6, '#697992');
  c.strokeStyle = ink; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-9, headY - 4); c.lineTo(-2, headY - 2); c.moveTo(9, headY - 4); c.lineTo(2, headY - 2); c.stroke();
  eye(c, -5, headY, 0); eye(c, 5, headY, 0);
  oval(c, 0, headY + 5, 7.8, 3.6, '#c4c2c2');
  oval(c, 0, headY + 3.6, 2.4, 1.7, '#4d5b71');
  c.fillStyle = cream; for (const dx of [-4.2, 4.2]) { c.beginPath(); c.moveTo(dx - 1.2, headY + 6); c.lineTo(dx + 1.2, headY + 6); c.lineTo(dx, headY + 9); c.fill(); }
  paws(c, '#abb4c1', 10.5);
}

function dragon(c: Ctx2D, bounce: number) {
  const top = -23 + bounce * 5;
  wing(c, -1, top, 23 + bounce * 5, '#5d8d92', bounce);
  wing(c, 1, top, 23 + bounce * 5, '#5d8d92', bounce);
  c.beginPath(); c.moveTo(7, -9); c.quadraticCurveTo(18, -16, 19, -7); c.quadraticCurveTo(22, -3, 25, -9);
  c.quadraticCurveTo(24, 2, 15, -2); c.lineTo(7, -3); c.closePath(); fill(c, '#759e9d');
  oval(c, 0, -11 + bounce * 2, 8.5 + bounce * 2, 10 - bounce, '#87aeb0');
  oval(c, -1, top, 9.5, 8.5, '#9ec1bb');
  horn(c, -6.5, top - 5, -1, 8, '#698e93');
  horn(c, 6.5, top - 5, 1, 8, '#698e93');
  eye(c, -4, top - 1.2, .4); eye(c, 4, top - 1.2, -.4);
  oval(c, 0, top + 5, 7, 3.2, '#b9cfbf');
  oval(c, 0, top + 4.2, 2.3, 1.7, '#577f82');
  c.strokeStyle = ink; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-3.5, top + 7); c.quadraticCurveTo(0, top + 10, 3.5, top + 7); c.stroke();
  paws(c, '#afd0bd', 9);
}

export function gargoyleSpring(variant: GargoyleVariant) {
  return createSpringRenderer((ctx, x, y, _size, bounce) => {
    const compression = Math.max(0, Math.min(1, bounce / 5));
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(18,27,39,.25)'; ctx.beginPath(); ctx.ellipse(0, 1, 15, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    if (variant === 'gargoyle-imp') imp(ctx, compression);
    else if (variant === 'gargoyle-bulldog') bulldog(ctx, compression);
    else dragon(ctx, compression);
    base(ctx);
    ctx.restore();
  });
}
