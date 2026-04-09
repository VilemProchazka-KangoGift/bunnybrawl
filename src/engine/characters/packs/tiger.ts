import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.52, rx: w * 0.42, ry: h * 0.42 }, colors);
  // Round ears
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.arc(cx - 10, yOff + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 10, yOff + 4, 3, 0, Math.PI * 2);
  ctx.fill();
  // Black stripes on body — upper pair
  ctx.strokeStyle = colors.darkColor;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 8, yOff + h * 0.35); ctx.lineTo(cx - 12, yOff + h * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 5, yOff + h * 0.3); ctx.lineTo(cx - 8, yOff + h * 0.42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 8, yOff + h * 0.35); ctx.lineTo(cx + 12, yOff + h * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 5, yOff + h * 0.3); ctx.lineTo(cx + 8, yOff + h * 0.42); ctx.stroke();
  // Lower body stripes
  ctx.beginPath(); ctx.moveTo(cx - 7, yOff + h * 0.5); ctx.lineTo(cx - 11, yOff + h * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 7, yOff + h * 0.5); ctx.lineTo(cx + 11, yOff + h * 0.6); ctx.stroke();
  // White muzzle
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx + 1, yOff + h * 0.52, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.fillStyle = '#FF6060';
  ctx.beginPath();
  ctx.ellipse(cx + 1, yOff + h * 0.48, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Whiskers
  ctx.strokeStyle = '#DDD';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 4, yOff + h * 0.52); ctx.lineTo(cx - 14, yOff + h * 0.48); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 4, yOff + h * 0.54); ctx.lineTo(cx - 14, yOff + h * 0.56); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, yOff + h * 0.52); ctx.lineTo(cx + 16, yOff + h * 0.48); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 6, yOff + h * 0.54); ctx.lineTo(cx + 16, yOff + h * 0.56); ctx.stroke();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'snout') {
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const tiger: CharacterPack = {
  name: 'Tiger',
  color: '#E8820A', darkColor: '#1A1A1A', lightColor: '#FFD080',
  emoji: '\uD83D\uDC2F', customEyes: false, idleTransform: 'headBob',
  splatShape: 'paw',
  gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Tiger', cs: 'Tygr', hi: 'बाघ', fil: 'Tigre' },
  legStyle: { shape: 'tapered', footStyle: 'paw', legWidth: 5 },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.52, rx: w * 0.42, ry: h * 0.42 }),
  drawSprite, drawGib,
};
