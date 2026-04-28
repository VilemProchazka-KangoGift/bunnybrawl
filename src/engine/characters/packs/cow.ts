import { Howl } from 'howler';
import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.52, rx: w * 0.42, ry: h * 0.42 }, colors);
  // Black patches
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx - 6, yOff + h * 0.4, 5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 4, yOff + h * 0.58, 4, 3.5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 8, yOff + h * 0.35, 3, 2.5, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Small horns
  ctx.fillStyle = '#E8D8A0';
  ctx.beginPath();
  ctx.moveTo(cx - 7, yOff + 6);
  ctx.lineTo(cx - 10, yOff - 4);
  ctx.lineTo(cx - 5, yOff + 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 7, yOff + 6);
  ctx.lineTo(cx + 10, yOff - 4);
  ctx.lineTo(cx + 5, yOff + 4);
  ctx.fill();
  // Pink nose/muzzle
  ctx.fillStyle = '#FFB0B0';
  ctx.beginPath();
  ctx.ellipse(cx + 2, yOff + h * 0.52, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = '#D08080';
  ctx.beginPath();
  ctx.arc(cx + 0.5, yOff + h * 0.52, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 3.5, yOff + h * 0.52, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Custom eyes
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, yOff + h * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath(); ctx.arc(cx - 4, yOff + h * 0.36, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, yOff + h * 0.36, 1, 0, Math.PI * 2); ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'horn') {
    ctx.fillStyle = '#F5DEB3';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-3, 5);
    ctx.lineTo(3, 5);
    ctx.closePath();
    ctx.fill();
  } else if (gibType === 'tail') {
    ctx.strokeStyle = colors.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.stroke();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 5, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const cow: CharacterPack = {
  name: 'Cow',
  color: '#F5F0E0', darkColor: '#4A3A2A', lightColor: '#FFFFFF',
  emoji: '\uD83D\uDC2E', customEyes: true,
  splatShape: 'splat',
  gibs: [{ gibType: 'horn', width: 8, height: 12 }, { gibType: 'horn', width: 8, height: 12 }, { gibType: 'tail', width: 14, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Cow', cs: 'Kráva', hi: 'गाय', fil: 'Baka' },
  legStyle: { shape: 'rounded', footStyle: 'hoof', legWidth: 5 },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.52, rx: w * 0.42, ry: h * 0.42 }),
  drawSprite, drawGib,
  createSound: () => new Howl({
    src: [generateMultiSegmentTone([
      { freq: 130, freqEnd: 160, duration: 0.15, type: 'sine' },
      { freq: 160, freqEnd: 130, duration: 0.25, type: 'sine' },
    ], 0.4)],
    volume: 0.4,
  }),
};
