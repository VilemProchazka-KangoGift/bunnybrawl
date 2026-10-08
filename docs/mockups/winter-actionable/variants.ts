import type { Ctx2D, WeatherParticle } from '../../../src/engine/types';

export const ACTION_VARIANTS = ['ink-bell', 'crystal-bloom', 'carved-puck'] as const;
export type ActionVariant = typeof ACTION_VARIANTS[number];

const TAU = Math.PI * 2;

function trace(ctx: Ctx2D, fill: string, stroke = '#304254', lineWidth = 2): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
}

function shard(ctx: Ctx2D, cx: number, baseY: number, width: number, height: number,
  lean: number, fill: string, edge: string): void {
  ctx.beginPath();
  ctx.moveTo(cx - width * .55, baseY);
  ctx.quadraticCurveTo(cx - width * .42, baseY - height * .28, cx + lean * .5 - width * .25, baseY - height * .66);
  ctx.lineTo(cx + lean, baseY - height);
  ctx.lineTo(cx + lean + width * .27, baseY - height * .45);
  ctx.lineTo(cx + width * .55, baseY);
  ctx.closePath();
  trace(ctx, fill, edge, 1.8);
  ctx.fillStyle = 'rgba(255,255,255,.52)';
  ctx.beginPath();
  ctx.moveTo(cx + lean, baseY - height + 3);
  ctx.lineTo(cx + lean - width * .22, baseY - height * .4);
  ctx.lineTo(cx - width * .14, baseY - 3);
  ctx.lineTo(cx + width * .06, baseY - 3);
  ctx.closePath();
  ctx.fill();
}

function snowFoot(ctx: Ctx2D, x: number, y: number, width: number): void {
  ctx.fillStyle = '#d9e9ef';
  ctx.strokeStyle = '#546b7b';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(x - width * .52, y);
  ctx.quadraticCurveTo(x - width * .27, y - 5, x + width * .03, y - 3);
  ctx.quadraticCurveTo(x + width * .33, y - 5, x + width * .52, y);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
}

export function drawActionThorn(ctx: Ctx2D, x: number, y: number, width: number, height: number,
  variant: ActionVariant): void {
  const base = y + height;
  ctx.save();
  snowFoot(ctx, x + width / 2, base, width);
  if (variant === 'ink-bell') {
    for (const [p, h, w, lean] of [[.17,.62,.18,-2],[.38,.9,.2,-1],[.58,1.1,.23,2],[.82,.72,.18,2]]) {
      shard(ctx, x + width * p, base, width * w, height * h, lean, '#73b9cf', '#263e50');
    }
  } else if (variant === 'crystal-bloom') {
    for (const [p, h, w, lean] of [[.12,.58,.2,-4],[.36,1,.25,-3],[.61,.9,.24,4],[.86,.65,.2,4]]) {
      shard(ctx, x + width * p, base, width * w, height * h, lean, '#9ad8e9', '#53608a');
    }
    ctx.fillStyle = '#b3a8dd';
    ctx.beginPath(); ctx.ellipse(x + width * .53, base - height * .33, 2.6, 4.5, -.4, 0, TAU); ctx.fill();
  } else {
    for (const [p, h, w, lean] of [[.16,.65,.2,-1],[.37,.95,.22,0],[.61,.82,.24,1],[.84,.58,.18,2]]) {
      shard(ctx, x + width * p, base, width * w, height * h, lean, '#75adc2', '#263b4b');
    }
    ctx.strokeStyle = '#e7f5fa'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x + 4, base - 2); ctx.lineTo(x + width - 4, base - 2); ctx.stroke();
  }
  ctx.restore();
}

export function drawActionZone(ctx: Ctx2D, x: number, y: number, width: number, height: number,
  variant: ActionVariant): void {
  ctx.save();
  ctx.fillStyle = '#789bac';
  ctx.strokeStyle = '#263e50'; ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + width + 2, y - 2);
  ctx.lineTo(x + width, y + 3); ctx.lineTo(x, y + 3); ctx.closePath();
  ctx.fill(); ctx.stroke();
  const fringe = variant === 'carved-puck'
    ? [[.13, .69, 12, -1], [.37, 1, 14, 1], [.68, .86, 15, -1], [.91, .58, 11, 1]]
    : [[.1, .55, 9, -2], [.29, .94, 12, 1], [.51, .73, 10, -1], [.75, 1, 13, 2], [.94, .54, 8, 1]];
  for (const [position, scale, widthPx, lean] of fringe) {
    const cx = x + width * position;
    const h = (height + 2) * scale;
    shard(ctx, cx, y + 1, widthPx, -h, lean,
      variant === 'crystal-bloom' ? '#a9d9e9' : '#80bbcf',
      variant === 'crystal-bloom' ? '#596483' : '#284354');
  }
  ctx.restore();
}

function springStem(ctx: Ctx2D): void {
  ctx.fillStyle = '#d2a870';
  ctx.strokeStyle = '#354650'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -4); ctx.quadraticCurveTo(-9, -14, -4, -17);
  ctx.lineTo(5, -17); ctx.quadraticCurveTo(0, -12, 6, -4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#fff1c7'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-3, -7); ctx.quadraticCurveTo(0, -10, 2, -8); ctx.stroke();
}

export function drawActionSpring(ctx: Ctx2D, x: number, y: number, size: number, bounce: number,
  variant: ActionVariant): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 34, size / 34);
  const compress = Math.max(-3, Math.min(4, bounce * .35));
  ctx.translate(0, compress);
  ctx.fillStyle = 'rgba(44,66,80,.22)';
  ctx.beginPath(); ctx.ellipse(0, -1, 17, 3, 0, 0, TAU); ctx.fill();
  if (variant === 'carved-puck') {
    ctx.fillStyle = '#6b98aa'; ctx.strokeStyle = '#304254'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-9,-3); ctx.lineTo(-7,-14); ctx.lineTo(7,-14); ctx.lineTo(9,-3); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d48b45'; ctx.strokeStyle = '#304254';
    ctx.beginPath(); ctx.ellipse(0,-17,16,6,0,0,TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f5cf79'; ctx.beginPath(); ctx.ellipse(0,-19,11,2.5,0,0,TAU); ctx.fill();
    ctx.strokeStyle = '#f7f2e7'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-13,-19); ctx.lineTo(-8,-24); ctx.lineTo(-1,-21);
    ctx.moveTo(4,-21); ctx.lineTo(11,-24); ctx.stroke();
  } else {
    springStem(ctx);
    ctx.beginPath();
    if (variant === 'ink-bell') {
      ctx.moveTo(-18,-17); ctx.quadraticCurveTo(-17,-31,-4,-29);
      ctx.quadraticCurveTo(4,-33,14,-25); ctx.quadraticCurveTo(18,-22,18,-17);
      ctx.quadraticCurveTo(10,-20,1,-18); ctx.quadraticCurveTo(-8,-21,-18,-17);
      ctx.closePath(); trace(ctx, '#d89a43');
      ctx.fillStyle = '#f4c977';
      ctx.beginPath(); ctx.moveTo(-14,-23); ctx.quadraticCurveTo(-3,-32,9,-26);
      ctx.quadraticCurveTo(0,-27,-14,-23); ctx.fill();
      ctx.strokeStyle = '#f2f4e8'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-15,-19); ctx.quadraticCurveTo(-7,-22,-1,-20);
      ctx.moveTo(5,-20); ctx.quadraticCurveTo(12,-22,16,-19); ctx.stroke();
    } else {
      ctx.moveTo(-15,-17); ctx.quadraticCurveTo(-18,-29,-6,-29);
      ctx.quadraticCurveTo(-3,-34,3,-31); ctx.quadraticCurveTo(17,-29,16,-17);
      ctx.quadraticCurveTo(5,-22,-15,-17); ctx.closePath(); trace(ctx, '#7385b9', '#37455f');
      ctx.fillStyle = '#afbae1';
      ctx.beginPath(); ctx.moveTo(-9,-25); ctx.quadraticCurveTo(-2,-33,5,-27);
      ctx.quadraticCurveTo(0,-25,-9,-25); ctx.fill();
      ctx.strokeStyle = '#e4f3f5'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14,-18); ctx.quadraticCurveTo(0,-22,14,-18); ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawActionSnow(ctx: Ctx2D, particle: WeatherParticle, variant: ActionVariant): void {
  const { x, y, size } = particle;
  ctx.save();
  if (variant === 'ink-bell') {
    ctx.fillStyle = 'rgba(240,248,250,.52)';
    ctx.beginPath(); ctx.arc(x,y,Math.min(2.6,size*.7),0,TAU); ctx.fill();
  } else if (variant === 'crystal-bloom') {
    ctx.strokeStyle = 'rgba(224,241,251,.48)'; ctx.lineWidth = Math.max(1,size*.3);
    ctx.beginPath(); ctx.moveTo(x-2,y-2); ctx.lineTo(x+2,y+3); ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(235,246,249,.38)';
    ctx.beginPath(); ctx.arc(x,y,Math.min(1.6,size*.48),0,TAU); ctx.fill();
  }
  ctx.restore();
}
