import type { Ctx2D } from '../../../../src/engine/types';
import { createSpringRenderer, createThornRenderer } from '../../../../src/engine/themes/drawPrimitives';

export const ACTIONABLE_VARIANTS = ['actionable-iron-fangs', 'actionable-bat-wing', 'actionable-moon-bell'] as const;
export type ActionableVariant = typeof ACTIONABLE_VARIANTS[number];

const ink = '#273249';
const iron = '#9bb0c0';
const light = '#dce8dc';
const shadow = '#4c627a';
const gold = '#d8bb74';

function outline(c: Ctx2D, width = 1.3) {
  c.strokeStyle = ink; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}

function thorn(c: Ctx2D, x: number, y: number, w: number, h: number, variant: ActionableVariant) {
  const bottom = y + h;
  c.save();
  c.fillStyle = ink;
  c.beginPath(); c.moveTo(x + 1, bottom - 3); c.quadraticCurveTo(x + w / 2, bottom - 1, x + w - 1, bottom - 3);
  c.lineTo(x + w - 1, bottom); c.lineTo(x + 1, bottom); c.closePath(); c.fill(); outline(c);
  if (variant === 'actionable-iron-fangs') {
    // Three large staggered teeth stay clear within the 28×12 hitbox.
    for (const [px, peak] of [[.2, .18], [.5, .02], [.8, .23]]) {
      const cx = x + w * px;
      c.fillStyle = iron;
      c.beginPath(); c.moveTo(cx - w * .14, bottom - 3); c.quadraticCurveTo(cx - w * .07, y + h * .38, cx, y + h * peak);
      c.quadraticCurveTo(cx + w * .05, y + h * .54, cx + w * .14, bottom - 3); c.closePath(); c.fill(); outline(c);
      c.fillStyle = light; c.beginPath(); c.moveTo(cx, y + h * peak + 2); c.lineTo(cx - w * .065, bottom - 4); c.lineTo(cx - 1, bottom - 4); c.closePath(); c.fill();
    }
  } else if (variant === 'actionable-bat-wing') {
    c.fillStyle = iron;
    c.beginPath(); c.moveTo(x + 2, bottom - 3); c.lineTo(x + 2, y + h * .25);
    c.quadraticCurveTo(x + w * .25, y + h * .56, x + w * .5, y + 1);
    c.quadraticCurveTo(x + w * .75, y + h * .56, x + w - 2, y + h * .25);
    c.lineTo(x + w - 2, bottom - 3); c.quadraticCurveTo(x + w * .74, bottom - 7, x + w * .5, bottom - 3);
    c.quadraticCurveTo(x + w * .26, bottom - 7, x + 2, bottom - 3); c.fill(); outline(c);
    c.strokeStyle = light; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 6, y + 5); c.lineTo(x + w * .5, y + 2); c.lineTo(x + w - 6, y + 5); c.stroke();
  } else {
    // Castle crenellations read as a low iron crown rather than needles.
    c.fillStyle = iron;
    c.beginPath(); c.moveTo(x + 2, bottom - 3); c.lineTo(x + 3, y + 4); c.lineTo(x + 7, y + 6);
    c.lineTo(x + w * .5, y + 1); c.lineTo(x + w - 7, y + 6); c.lineTo(x + w - 3, y + 4);
    c.lineTo(x + w - 2, bottom - 3); c.closePath(); c.fill(); outline(c);
    c.fillStyle = light; c.beginPath(); c.moveTo(x + w * .5, y + 3); c.lineTo(x + 8, bottom - 4); c.lineTo(x + w * .5, bottom - 4); c.closePath(); c.fill();
    c.fillStyle = gold; c.beginPath(); c.arc(x + w * .5, bottom - 3.5, 1.4, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

function spring(c: Ctx2D, x: number, y: number, size: number, bounce: number, variant: ActionableVariant) {
  const compression = Math.max(0, Math.min(1, bounce / 5));
  const top = y - size * (.96 - compression * .26);
  const spread = size * (.42 + compression * .15);
  c.save();
  c.fillStyle = 'rgba(14,22,39,.25)'; c.beginPath(); c.ellipse(x, y + 1, size * .42, 2.3, 0, 0, Math.PI * 2); c.fill();
  if (variant === 'actionable-iron-fangs') {
    // A friendly stone gargoyle squats lower and opens its wings on bounce.
    c.fillStyle = shadow;
    c.beginPath(); c.moveTo(x - 3, top + 8); c.quadraticCurveTo(x - spread, top - 1, x - spread, top + 11);
    c.quadraticCurveTo(x - spread * .55, top + 7, x - 5, y - 4); c.closePath(); c.fill(); outline(c);
    c.beginPath(); c.moveTo(x + 3, top + 8); c.quadraticCurveTo(x + spread, top - 1, x + spread, top + 11);
    c.quadraticCurveTo(x + spread * .55, top + 7, x + 5, y - 4); c.closePath(); c.fill(); outline(c);
    c.fillStyle = iron; c.beginPath(); c.ellipse(x, y - size * .36, size * .29, size * (.27 - compression * .05), 0, 0, Math.PI * 2); c.fill(); outline(c);
    c.fillStyle = light; c.beginPath(); c.ellipse(x - 2, y - size * .46, size * .15, size * .09, -.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = iron; c.beginPath(); c.ellipse(x, top + 8, size * .29, size * .24, 0, 0, Math.PI * 2); c.fill(); outline(c);
    c.fillStyle = iron;
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(x + side * 5, top + 5); c.lineTo(x + side * 7, top - 2);
      c.lineTo(x + side * 2, top + 3); c.closePath(); c.fill(); outline(c);
    }
    c.fillStyle = gold; for (const dx of [-4, 4]) { c.beginPath(); c.arc(x + dx, top + 7, 1.3, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = shadow; c.beginPath(); c.ellipse(x, top + 11, 4.5, 2.2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = light; for (const dx of [-2.1, 2.1]) { c.beginPath(); c.moveTo(x + dx - 1, top + 10); c.lineTo(x + dx + 1, top + 10); c.lineTo(x + dx, top + 13); c.fill(); }
  } else if (variant === 'actionable-bat-wing') {
    // Wide folded bat silhouette makes compression read through the wings.
    c.fillStyle = '#56617e';
    c.beginPath(); c.moveTo(x, y - 4); c.quadraticCurveTo(x - spread * .7, top + 3, x - spread, top + 4);
    c.lineTo(x - spread * .7, top + 14); c.quadraticCurveTo(x - spread * .3, top + 11, x, y - 6);
    c.quadraticCurveTo(x + spread * .3, top + 11, x + spread * .7, top + 14);
    c.lineTo(x + spread, top + 4); c.quadraticCurveTo(x + spread * .7, top + 3, x, y - 4); c.fill(); outline(c);
    c.fillStyle = iron; c.beginPath(); c.ellipse(x, y - size * .43, size * .24, size * (.32 - compression * .06), 0, 0, Math.PI * 2); c.fill(); outline(c);
    c.beginPath(); c.moveTo(x - 6, top + 9); c.lineTo(x - 8, top + 1); c.lineTo(x - 2, top + 6);
    c.lineTo(x + 2, top + 6); c.lineTo(x + 8, top + 1); c.lineTo(x + 6, top + 9); c.closePath(); c.fill(); outline(c);
    c.fillStyle = gold; for (const dx of [-3, 3]) { c.beginPath(); c.arc(x + dx, top + 12, 1.3, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = ink; c.beginPath(); c.ellipse(x, top + 16, 3.5, 1.7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = light; for (const dx of [-2, 2]) { c.beginPath(); c.moveTo(x + dx - 1, top + 15); c.lineTo(x + dx + 1, top + 15); c.lineTo(x + dx, top + 18); c.fill(); }
  } else {
    // A moon bell compresses like a squat spring cup, not a static statuette.
    c.fillStyle = shadow; c.beginPath(); c.moveTo(x - spread * .85, y - 4); c.quadraticCurveTo(x, y + 1, x + spread * .85, y - 4);
    c.lineTo(x + spread * .52, top + 4); c.quadraticCurveTo(x, top - 3, x - spread * .52, top + 4); c.closePath(); c.fill(); outline(c);
    c.fillStyle = iron; c.beginPath(); c.moveTo(x - spread * .75, y - 6); c.quadraticCurveTo(x, y - 2, x + spread * .75, y - 6);
    c.lineTo(x + spread * .48, top + 6); c.quadraticCurveTo(x, top + 1, x - spread * .48, top + 6); c.closePath(); c.fill(); outline(c);
    c.strokeStyle = light; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - spread * .46, top + 8); c.quadraticCurveTo(x, top + 4, x + spread * .28, top + 7); c.stroke();
    c.fillStyle = shadow;
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(x + side * 6, top + 8); c.lineTo(x + side * 10, top - 1);
      c.lineTo(x + side * 11, top + 10); c.closePath(); c.fill(); outline(c);
    }
    c.fillStyle = gold; for (const dx of [-3.5, 3.5]) { c.beginPath(); c.arc(x + dx, top + 12, 1.4, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = ink; c.beginPath(); c.ellipse(x, top + 17, 4, 1.7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = light; for (const dx of [-2, 2]) { c.beginPath(); c.moveTo(x + dx - 1, top + 16); c.lineTo(x + dx + 1, top + 16); c.lineTo(x + dx, top + 19); c.fill(); }
  }
  c.fillStyle = shadow; c.fillRect(x - size * .34, y - 3, size * .68, 3);
  c.strokeStyle = ink; c.lineWidth = 1.2; c.strokeRect(x - size * .34, y - 3, size * .68, 3);
  c.restore();
}

export function actionableRenderers(variant: ActionableVariant) {
  return {
    thorn: createThornRenderer((c, x, y, w, h) => thorn(c, x, y, w, h, variant)),
    spring: createSpringRenderer((c, x, y, size, bounce) => spring(c, x, y, size, bounce, variant)),
  };
}
