import { Howl } from 'howler';
import type { CharacterPack } from '../types';
import { fillBodyGradientCircle } from '../../spriteShading';
import { floatBufferToWavDataUri } from '../../audio/synthesis/wav';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, _w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  // Fluffy body — multiple overlapping circles
  fillBodyGradientCircle(ctx, cx - 6, yOff + h * 0.48, 8, colors);
  fillBodyGradientCircle(ctx, cx + 6, yOff + h * 0.48, 8, colors);
  fillBodyGradientCircle(ctx, cx, yOff + h * 0.42, 9, colors);
  fillBodyGradientCircle(ctx, cx - 4, yOff + h * 0.56, 7, colors);
  fillBodyGradientCircle(ctx, cx + 4, yOff + h * 0.56, 7, colors);
  fillBodyGradientCircle(ctx, cx, yOff + h * 0.35, 7, colors);
  // Small dark face
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx + 2, yOff + h * 0.44, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes on dark face
  ctx.fillStyle = '#FFF';
  ctx.beginPath(); ctx.arc(cx - 0.5, yOff + h * 0.4, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4.5, yOff + h * 0.4, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - 0.5, yOff + h * 0.4, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4.5, yOff + h * 0.4, 1, 0, Math.PI * 2); ctx.fill();
  // Small ears peeking from wool
  ctx.fillStyle = colors.darkColor;
  ctx.beginPath();
  ctx.ellipse(cx - 10, yOff + h * 0.38, 3, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, yOff + h * 0.38, 3, 5, 0.4, 0, Math.PI * 2);
  ctx.fill();
};

const drawGib: CharacterPack['drawGib'] = (ctx, gibType, _w, _h, colors) => {
  if (gibType === 'ear') {
    ctx.fillStyle = colors.darkColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (gibType === 'wool') {
    ctx.fillStyle = colors.lightColor;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 4, Math.sin(a) * 3, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

export const sheep: CharacterPack = {
  name: 'Sheep',
  color: '#F0EDE8', darkColor: '#B0A898', lightColor: '#FFFFFF',
  emoji: '\uD83D\uDC11', customEyes: true,
  splatShape: 'paw',
  gibs: [{ gibType: 'ear', width: 8, height: 8 }, { gibType: 'ear', width: 8, height: 8 }, { gibType: 'wool', width: 14, height: 12 }, { gibType: 'body', width: 14, height: 12 }],
  translations: { en: 'Sheep', cs: 'Ovce', hi: 'भेड़', fil: 'Tupa' },
  legStyle: { shape: 'rounded', footStyle: 'hoof', legWidth: 5 },
  // Face shifted right ~2px: eyes at (cx-0.5, cx+4.5), y=16, r=2.
  eyebrowAnchor: {
    leftOuter: { x: -6, y: 12 }, leftInner: { x: -2, y: 13.6 },
    rightOuter: { x: 10, y: 12 }, rightInner: { x: 4, y: 13.6 },
  },
  bodyEllipse: (cx, yOff, _w, h) => ({ cx, cy: yOff + h * 0.46, rx: 12, ry: h * 0.18 }),
  drawSprite, drawGib,
  createSound: () => {
    // Wobbly baa — 350→250Hz sine with 12Hz vibrato (depth 18Hz).
    const sampleRate = 44100;
    const duration = 0.3;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const progress = i / numSamples;
      const baseFreq = 350 + (250 - 350) * progress;
      const wobble = Math.sin(2 * Math.PI * 12 * t) * 18;
      const envelope = Math.max(0, 1 - progress) * 0.4;
      buffer[i] = Math.sin(2 * Math.PI * (baseFreq + wobble) * t) * envelope;
    }
    return new Howl({ src: [floatBufferToWavDataUri(buffer, sampleRate)], volume: 0.4 });
  },
};
