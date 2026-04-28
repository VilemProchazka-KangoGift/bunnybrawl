import { Howl } from 'howler';
import type { CharacterPack } from '../types';
import { fillBodyGradient } from '../../spriteShading';
import { generateMultiSegmentTone } from '../../audio/synthesis/core';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, state, animFrame, _isIdleAnim, _idleT, colors) => {
  const isAirborne = state === 'airborne';
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.5, rx: w * 0.4, ry: h * 0.42 }, colors);
  // Ear tufts
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.moveTo(cx - 8, yOff + 6);
  ctx.lineTo(cx - 12, yOff - 6);
  ctx.lineTo(cx - 4, yOff + 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 8, yOff + 6);
  ctx.lineTo(cx + 12, yOff - 6);
  ctx.lineTo(cx + 4, yOff + 4);
  ctx.fill();
  // White face disk
  ctx.fillStyle = '#E8E0F0';
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.38, w * 0.28, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Big round eyes
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(cx - 5, yOff + h * 0.36, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, yOff + h * 0.36, 4, 0, Math.PI * 2);
  ctx.fill();
  // Pupils
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 4.5, yOff + h * 0.36, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5.5, yOff + h * 0.36, 2, 0, Math.PI * 2);
  ctx.fill();
  // Beak
  ctx.fillStyle = '#D4A030';
  ctx.beginPath();
  ctx.moveTo(cx - 2, yOff + h * 0.45);
  ctx.lineTo(cx, yOff + h * 0.52);
  ctx.lineTo(cx + 2, yOff + h * 0.45);
  ctx.fill();
  // Belly
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.62, w * 0.22, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wing
  const wingFlap = isAirborne ? Math.sin(animFrame * Math.PI) * 5 : 0;
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.42, yOff + h * 0.5 - wingFlap, 5, 9, -0.3, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'wing') {
    ctx.fillStyle = colors.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 4, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 2, 4, 2, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const owl: CharacterPack = {
  name: 'Owl',
  color: '#9370DB', darkColor: '#6A4DB0', lightColor: '#B8A0E8',
  emoji: '\uD83E\uDD89', customEyes: true,
  idleActions: { weights: { stretch: 0 } },
  splatShape: 'ring',
  gibs: [{ gibType: 'wing', width: 12, height: 8 }, { gibType: 'wing', width: 12, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Owl', cs: 'Sova', hi: 'उल्लू', fil: 'Kuwago' },
  legStyle: { shape: 'stick', footStyle: 'claw', legWidth: 8, legHeight: 4, footWidth: 10, footHeight: 3 },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.5, rx: w * 0.4, ry: h * 0.42 }),
  drawSprite, drawGib,
  createSound: () => new Howl({
    src: [generateMultiSegmentTone([
      { freq: 380, freqEnd: 320, duration: 0.1, type: 'sine' },
      { freq: 380, freqEnd: 320, duration: 0.1, type: 'sine' },
      { freq: 360, freqEnd: 280, duration: 0.18, type: 'sine' },
    ], 0.4)],
    volume: 0.4,
  }),
};
