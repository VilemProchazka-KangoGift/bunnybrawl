import type { Ctx2D } from '../../../../src/engine/types';
import { createThornRenderer } from '../../../../src/engine/themes/drawPrimitives';

export const CASTLE_THORNS = ['thorn-forged-fangs', 'thorn-crescent', 'thorn-split-crown'] as const;
export type CastleThorn = typeof CASTLE_THORNS[number];

const ink = '#26334b';
const dark = '#40566d';
const steel = '#8da8bd';
const sheen = '#d7e7e5';

function shape(c: Ctx2D, fill: string, draw: () => void, width = 1.15) {
  c.beginPath(); draw(); c.closePath();
  c.fillStyle = fill; c.fill();
  c.strokeStyle = ink; c.lineWidth = width; c.lineJoin = 'round'; c.stroke();
}

function base(c: Ctx2D) {
  shape(c, dark, () => {
    c.moveTo(1, 9.3); c.quadraticCurveTo(14, 8.5, 27, 9.3);
    c.lineTo(27, 11.6); c.quadraticCurveTo(14, 12.2, 1, 11.6);
  });
  c.fillStyle = '#afc3ca'; c.fillRect(3, 9.1, 22, .65);
}

function forgedFangs(c: Ctx2D) {
  // Three unequal, curved blades; broad highlights survive at 1:1 size.
  for (const [left, tip, right, top] of [[2, 7, 12, 2.8], [8.7, 14.7, 20, .4], [17.3, 22, 27, 3.1]]) {
    shape(c, steel, () => {
      c.moveTo(left, 9.4); c.quadraticCurveTo(tip - 2, 5.4, tip, top);
      c.quadraticCurveTo(tip + 1.2, 5.1, right, 9.4);
    });
    c.fillStyle = sheen;
    c.beginPath(); c.moveTo(tip - .6, top + 2); c.quadraticCurveTo(tip - 1.6, 6.2, left + 2.1, 8.6);
    c.lineTo(left + 4.1, 8.6); c.closePath(); c.fill();
  }
}

function crescent(c: Ctx2D) {
  // Two swept blades frame a high central tooth, like moonlit ironwork.
  shape(c, '#7894ac', () => {
    c.moveTo(2, 9.4); c.quadraticCurveTo(3, 5.5, 1.7, 2.6);
    c.quadraticCurveTo(7.5, 3.4, 10.8, 9.4);
  });
  shape(c, '#7894ac', () => {
    c.moveTo(17.2, 9.4); c.quadraticCurveTo(20.5, 3.4, 26.3, 2.6);
    c.quadraticCurveTo(25, 5.5, 26, 9.4);
  });
  shape(c, '#a3bfd0', () => {
    c.moveTo(9.1, 9.4); c.quadraticCurveTo(12.2, 5.7, 14, 1.1);
    c.quadraticCurveTo(15.8, 5.7, 18.9, 9.4);
  });
  c.strokeStyle = sheen; c.lineWidth = .9; c.beginPath();
  c.moveTo(4.2, 4.3); c.quadraticCurveTo(6.9, 5.3, 8.2, 7.6);
  c.moveTo(12.9, 4.1); c.lineTo(11.6, 8.2);
  c.moveTo(23.8, 4.3); c.quadraticCurveTo(21.1, 5.3, 19.8, 7.6);
  c.stroke();
}

function splitCrown(c: Ctx2D) {
  // A battered portcullis crown: offset teeth instead of repeating needles.
  shape(c, '#8198ad', () => {
    c.moveTo(2, 9.4); c.lineTo(3.2, 4); c.lineTo(7.2, 6.2);
    c.lineTo(10.2, 1.3); c.lineTo(13.3, 5.3);
    c.lineTo(17.7, 2.1); c.lineTo(20.2, 6.1);
    c.lineTo(25.2, 3.7); c.lineTo(26, 9.4);
  });
  c.fillStyle = sheen; c.beginPath();
  c.moveTo(10.1, 3.5); c.lineTo(8.8, 8.4); c.lineTo(12.1, 8.4); c.closePath(); c.fill();
  c.fillStyle = '#526a80'; c.beginPath();
  c.moveTo(18.1, 4.2); c.lineTo(20.5, 8.4); c.lineTo(17.3, 8.4); c.closePath(); c.fill();
}

export function castleThornRenderer(variant: CastleThorn) {
  return createThornRenderer((c, x, y, w, h) => {
    c.save(); c.translate(x, y); c.scale(w / 28, h / 12);
    if (variant === 'thorn-forged-fangs') forgedFangs(c);
    else if (variant === 'thorn-crescent') crescent(c);
    else splitCrown(c);
    base(c);
    c.restore();
  });
}
