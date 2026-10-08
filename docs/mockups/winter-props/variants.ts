import type { Arena, Ctx2D } from '../../../src/engine/types';
import { getFloatingPlatforms } from '../../../src/engine/themes/utils';

export const PROP_VARIANTS = ['round-grove', 'wind-carved', 'lake-cedar'] as const;
export type PropVariant = (typeof PROP_VARIANTS)[number];

const looks = {
  'round-grove': { ink: '#274a59', deep: '#285d59', main: '#37786c', light: '#68a398', snow: '#f7f8ef', shade: '#c6dbe1', bark: '#745949', berry: '#bb6d63' },
  'wind-carved': { ink: '#2e5262', deep: '#325c62', main: '#4e817e', light: '#91b6ae', snow: '#f5f7ef', shade: '#aeced7', bark: '#746657', berry: '#bc826a' },
  'lake-cedar': { ink: '#315264', deep: '#315e68', main: '#488486', light: '#8bb7b5', snow: '#f7f6ec', shade: '#c0dce0', bark: '#705f55', berry: '#bf7771' },
} as const;

function stroke(ctx: Ctx2D, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function ellipse(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, fill: string, line?: string, lineWidth = 1.6): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  if (line) stroke(ctx, line, lineWidth);
}

function drawFir(ctx: Ctx2D, x: number, y: number, height: number, variant: PropVariant, seed = 0): void {
  const p = looks[variant];
  const skew = variant === 'wind-carved' ? (seed % 2 ? -7 : 6) : variant === 'lake-cedar' ? (seed % 2 ? 2 : -2) : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(height / 80, height / 80);
  // The trunk is rooted behind the boughs and has a dark foot at the snow.
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-4, -31); ctx.lineTo(5, -32); ctx.lineTo(6, 0); ctx.closePath();
  ctx.fillStyle = p.bark; ctx.fill(); stroke(ctx, p.ink, 1.9);
  ctx.beginPath(); ctx.moveTo(0, -27); ctx.lineTo(1, -2); stroke(ctx, '#b49c79', 1.1);

  if (variant === 'round-grove') {
    ctx.beginPath(); ctx.moveTo(skew, -79);
    ctx.bezierCurveTo(-8, -75, -12, -65, -16, -59);
    ctx.bezierCurveTo(-20, -57, -23, -51, -18, -47);
    ctx.bezierCurveTo(-28, -42, -33, -32, -25, -27);
    ctx.bezierCurveTo(-39, -20, -35, -12, -22, -11);
    ctx.bezierCurveTo(-13, -9, -8, -14, -1, -12);
    ctx.bezierCurveTo(6, -9, 16, -7, 24, -12);
    ctx.bezierCurveTo(36, -14, 37, -22, 24, -28);
    ctx.bezierCurveTo(29, -34, 22, -43, 15, -47);
    ctx.bezierCurveTo(20, -54, 13, -62, 9, -64);
    ctx.bezierCurveTo(9, -72, 4, -78, skew, -79); ctx.closePath();
  } else if (variant === 'wind-carved') {
    ctx.beginPath(); ctx.moveTo(skew, -79);
    ctx.bezierCurveTo(skew - 8, -69, skew - 12, -61, skew - 24, -55);
    ctx.quadraticCurveTo(skew - 30, -49, skew - 17, -48);
    ctx.bezierCurveTo(skew - 29, -40, skew - 39, -33, skew - 35, -28);
    ctx.quadraticCurveTo(skew - 24, -26, skew - 18, -28);
    ctx.bezierCurveTo(skew - 30, -18, skew - 32, -13, skew - 18, -11);
    ctx.quadraticCurveTo(0, -8, 16, -13);
    ctx.bezierCurveTo(36, -15, 39, -21, 24, -26);
    ctx.quadraticCurveTo(12, -28, 11, -30);
    ctx.bezierCurveTo(31, -35, 29, -42, 13, -47);
    ctx.bezierCurveTo(22, -55, 19, -60, 6, -65);
    ctx.quadraticCurveTo(10, -74, skew, -79); ctx.closePath();
  } else {
    ctx.beginPath(); ctx.moveTo(skew, -79);
    ctx.bezierCurveTo(-10, -75, -8, -68, -14, -63);
    ctx.bezierCurveTo(-20, -60, -17, -54, -22, -49);
    ctx.bezierCurveTo(-29, -44, -24, -37, -29, -32);
    ctx.bezierCurveTo(-35, -25, -27, -22, -30, -16);
    ctx.bezierCurveTo(-31, -10, -15, -10, -7, -13);
    ctx.quadraticCurveTo(0, -9, 7, -13);
    ctx.bezierCurveTo(17, -10, 34, -10, 30, -18);
    ctx.bezierCurveTo(26, -23, 35, -26, 27, -33);
    ctx.bezierCurveTo(20, -38, 27, -42, 19, -49);
    ctx.bezierCurveTo(11, -55, 18, -59, 12, -65);
    ctx.quadraticCurveTo(8, -76, skew, -79); ctx.closePath();
  }
  ctx.fillStyle = p.deep; ctx.fill(); stroke(ctx, p.ink, 2.2);
  ctx.save(); ctx.clip();
  // Large interlocking foliage planes, rather than repeated identical tiers.
  for (const [cx, cy, rx, ry] of [[-10,-27,19,9],[13,-21,19,9],[-8,-44,16,7],[9,-52,14,8],[1,-66,10,6]] as const) {
    ellipse(ctx, cx + skew * .25, cy, rx, ry, p.main);
  }
  for (const [cx, cy, rx, ry] of [[-17,-23,8,3],[14,-35,10,3],[-5,-48,8,2.5],[6,-63,6,2]] as const) {
    ellipse(ctx, cx, cy, rx, ry, p.light);
  }
  ctx.restore();
  const snowTiers = variant === 'wind-carved' ? [[-18,-58,15,3],[-22,-43,19,3],[11,-29,21,3]] : variant === 'lake-cedar' ? [[0,-68,9,3],[-11,-51,16,3],[12,-35,18,3],[-6,-20,24,4]] : [[0,-67,10,3],[-9,-51,17,3],[11,-37,18,3],[-6,-21,25,4]];
  for (const [cx, cy, rx, ry] of snowTiers) {
    ctx.beginPath(); ctx.moveTo(cx - rx, cy + 1);
    ctx.bezierCurveTo(cx - rx * .55, cy - ry * 1.5, cx - rx * .18, cy - ry * .7, cx, cy - ry);
    ctx.bezierCurveTo(cx + rx * .32, cy - ry * 1.7, cx + rx * .71, cy - ry * .3, cx + rx, cy + 1);
    ctx.bezierCurveTo(cx + rx * .43, cy + ry * .35, cx - rx * .49, cy + ry * .5, cx - rx, cy + 1);
    ctx.fillStyle = p.snow; ctx.fill(); stroke(ctx, p.ink, .85);
    ctx.beginPath(); ctx.moveTo(cx - rx * .45, cy - ry * .1); ctx.quadraticCurveTo(cx, cy - ry * .7, cx + rx * .38, cy - ry * .35);
    stroke(ctx, p.shade, .75);
  }
  ctx.restore();
}

function drawSnowFigure(ctx: Ctx2D, x: number, y: number, height: number, variant: PropVariant, large = false): void {
  const p = looks[variant];
  ctx.save(); ctx.translate(x, y); ctx.scale(height / 80, height / 80);
  ellipse(ctx, 0, -20, 21, 20, '#e5f0ee', p.ink, 2);
  ellipse(ctx, -5, -26, 13, 10, p.snow);
  ellipse(ctx, 1, -51, 14, 14, p.snow, p.ink, 1.8);
  ellipse(ctx, -5, -56, 5, 3, '#ffffff');
  // Warm scarf reads at the smallest snowman size.
  ctx.beginPath(); ctx.moveTo(-13,-42); ctx.quadraticCurveTo(0,-37,13,-43); ctx.lineTo(11,-38); ctx.quadraticCurveTo(0,-33,-12,-38); ctx.closePath();
  ctx.fillStyle = variant === 'wind-carved' ? '#ac7a70' : '#b65e63'; ctx.fill(); stroke(ctx,p.ink,1);
  ctx.beginPath(); ctx.moveTo(7,-37); ctx.lineTo(11,-22); ctx.lineTo(15,-23); ctx.lineTo(14,-39); ctx.closePath(); ctx.fill();
  ellipse(ctx,-4,-53,1.2,1.4,p.ink); ellipse(ctx,5,-53,1.2,1.4,p.ink);
  ctx.beginPath(); ctx.moveTo(1,-50); ctx.lineTo(9,-48); ctx.lineTo(2,-46); ctx.closePath(); ctx.fillStyle='#d29162'; ctx.fill();
  ellipse(ctx,-2,-26,1.3,1.3,p.ink); ellipse(ctx,3,-19,1.2,1.2,p.ink);
  if (large) {
    ctx.beginPath(); ctx.moveTo(-16,-66); ctx.lineTo(16,-66); stroke(ctx,p.ink,2.3);
    ctx.beginPath(); ctx.moveTo(-12,-66); ctx.lineTo(-10,-78); ctx.lineTo(10,-78); ctx.lineTo(12,-66); ctx.closePath();
    ctx.fillStyle='#384957'; ctx.fill(); stroke(ctx,p.ink,1.6);
    ctx.fillStyle='#b37172'; ctx.fillRect(-10,-69,20,3);
  }
  ctx.restore();
}

function drawIglooStudy(ctx: Ctx2D, x: number, y: number, width: number, height: number, variant: PropVariant): void {
  const p = looks[variant];
  ctx.save(); ctx.translate(x,y); ctx.scale(width/180,height/100);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(7,-47,30,-82,70,-92);
  ctx.bezierCurveTo(108,-105,147,-76,172,-27); ctx.quadraticCurveTo(180,-13,180,0); ctx.closePath();
  ctx.fillStyle='#c3d8df'; ctx.fill(); stroke(ctx,p.ink,2.2);
  ctx.beginPath(); ctx.moveTo(5,-16); ctx.bezierCurveTo(22,-67,52,-91,91,-91);
  ctx.bezierCurveTo(123,-88,148,-62,167,-22);
  ctx.bezierCurveTo(129,-33,117,-53,90,-62);
  ctx.bezierCurveTo(49,-75,27,-45,5,-16); ctx.closePath(); ctx.fillStyle=p.snow; ctx.fill();
  // Broad, irregular block seams, kept quieter than the doorway.
  ctx.save(); ctx.beginPath(); ctx.moveTo(1,0); ctx.bezierCurveTo(12,-52,41,-92,84,-94); ctx.bezierCurveTo(132,-96,167,-54,180,0); ctx.closePath(); ctx.clip();
  for (const [ax,ay,bx,by] of [[16,-20,53,-15],[42,-40,85,-36],[91,-38,136,-32],[59,-64,110,-61],[27,-45,33,-25],[80,-39,78,-15],[125,-53,128,-29],[115,-76,105,-61]] as const) {
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.quadraticCurveTo((ax+bx)/2,ay-2,bx,by); stroke(ctx,'#9fc0cc',1.3);
  }
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(102,0); ctx.bezierCurveTo(105,-40,118,-57,139,-56);
  ctx.bezierCurveTo(162,-55,170,-31,171,0); ctx.closePath(); ctx.fillStyle='#3e6274'; ctx.fill(); stroke(ctx,p.ink,2.1);
  ctx.beginPath(); ctx.moveTo(113,0); ctx.bezierCurveTo(115,-28,122,-43,139,-44); ctx.bezierCurveTo(155,-42,160,-25,160,0); ctx.closePath(); ctx.fillStyle='#253b52'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(100,-1); ctx.quadraticCurveTo(135,-5,174,-1); stroke(ctx,p.snow,3);
  ctx.restore();
}

function drawBush(ctx: Ctx2D, x: number, y: number, size: number, variant: PropVariant): void {
  const p=looks[variant];
  ctx.save(); ctx.translate(x,y); ctx.scale(size/34,size/34);
  // Fully opaque connected cover silhouette. No transparency, holes, or glow.
  ctx.beginPath(); ctx.moveTo(-31,0); ctx.bezierCurveTo(-36,-7,-34,-16,-26,-19);
  ctx.bezierCurveTo(-29,-28,-22,-34,-13,-32); ctx.bezierCurveTo(-8,-39,2,-39,8,-33);
  ctx.bezierCurveTo(16,-38,25,-31,25,-24); ctx.bezierCurveTo(36,-21,37,-10,31,0); ctx.closePath();
  ctx.fillStyle=p.deep; ctx.fill(); stroke(ctx,p.ink,2.3);
  ctx.save(); ctx.clip();
  for (const [cx,cy,rx,ry] of [[-24,-8,12,12],[-15,-22,14,10],[2,-24,15,12],[21,-16,15,13],[6,-8,21,9]] as const) {
    ellipse(ctx,cx,cy,rx,ry,p.main);
  }
  for (const [cx,cy] of [[-24,-13],[-14,-27],[2,-30],[18,-21],[24,-9]] as const) {
    ctx.beginPath(); ctx.moveTo(cx-7,cy+2); ctx.quadraticCurveTo(cx,cy-3,cx+7,cy+1); stroke(ctx,p.light,1.8);
  }
  ctx.restore();
  // Snow follows the crown; it does not replace the dark cover body.
  ctx.beginPath(); ctx.moveTo(-24,-19); ctx.bezierCurveTo(-22,-31,-14,-33,-8,-31);
  ctx.bezierCurveTo(-4,-37,5,-38,11,-31); ctx.bezierCurveTo(19,-34,25,-26,26,-21);
  ctx.bezierCurveTo(19,-23,17,-21,13,-19); ctx.bezierCurveTo(5,-26,-3,-22,-9,-20);
  ctx.bezierCurveTo(-16,-24,-20,-19,-24,-19); ctx.closePath();
  ctx.fillStyle=p.snow; ctx.fill(); stroke(ctx,p.ink,1.1);
  for (const [bx,by] of [[-20,-9],[18,-10],[-4,-14]] as const) ellipse(ctx,bx,by,1.5,1.8,p.berry);
  ctx.restore();
}

function drawSnowballPile(ctx: Ctx2D, x: number, y: number, variant: PropVariant): void {
  const p=looks[variant];
  for (let row=0;row<4;row++) {
    const count=4-row;
    for (let i=0;i<count;i++) {
      const cx=x+(i-(count-1)/2)*20;
      const cy=y-10-row*16;
      ellipse(ctx,cx,cy,10,9,row%2 ? '#eef6f3' : '#e3eff0',p.shade,1.2);
      ellipse(ctx,cx-2,cy-2,3.5,2.4,'rgba(255,255,255,.7)');
    }
  }
}

function drawDrift(ctx: Ctx2D, x: number, y: number, width: number, variant: PropVariant): void {
  const p=looks[variant];
  ctx.beginPath(); ctx.moveTo(x-width/2,y); ctx.bezierCurveTo(x-width*.33,y-6,x-width*.13,y-7,x,y-3);
  ctx.bezierCurveTo(x+width*.18,y-10,x+width*.31,y-5,x+width/2,y); ctx.closePath();
  ctx.fillStyle=p.snow; ctx.fill(); stroke(ctx,p.shade,.9);
}

function drawIcicleStudy(ctx: Ctx2D, x: number, y: number, length: number, variant: PropVariant): void {
  const p=looks[variant];
  ctx.beginPath(); ctx.moveTo(x-2,y); ctx.lineTo(x+2,y); ctx.quadraticCurveTo(x+1.2,y+length*.55,x,y+length);
  ctx.quadraticCurveTo(x-.7,y+length*.58,x-2,y); ctx.fillStyle='#a9d5e2'; ctx.fill(); stroke(ctx,p.ink,.8);
}

export function drawPropStudyBack(ctx: Ctx2D, arena: Arena, variant: PropVariant): void {
  const ground=arena.platforms[0]; const y=ground.y;
  const floats=getFloatingPlatforms(arena.platforms);
  drawSnowFigure(ctx,55,y,90,variant,true);
  drawIglooStudy(ctx,1080,y,180,100,variant);
  drawFir(ctx,200,y,75,variant,1);
  drawFir(ctx,640,y,55,variant,2);
  drawFir(ctx,1200,y,60,variant,3);
  drawSnowFigure(ctx,530,y,32,variant);
  drawDrift(ctx,700,y,180,variant);
  for (let i=0;i<floats.length;i++) {
    const plat=floats[i]; const mid=plat.x+plat.width/2;
    if (plat.width>=350) {
      drawFir(ctx,plat.x+35,plat.y,45,variant,i);
      drawFir(ctx,plat.x+plat.width*.35,plat.y,38,variant,i+1);
      drawSnowFigure(ctx,plat.x+plat.width*.58,plat.y,26,variant);
      drawFir(ctx,plat.x+plat.width-35,plat.y,42,variant,i+2);
      drawIcicleStudy(ctx,plat.x+60,plat.y+plat.height,10,variant);
      drawIcicleStudy(ctx,plat.x+plat.width-60,plat.y+plat.height,11,variant);
    } else if (plat.width>=200) {
      drawFir(ctx,plat.x+25,plat.y,38,variant,i);
      drawFir(ctx,plat.x+plat.width-28,plat.y,32,variant,i+1);
      if (i%2===0) drawSnowFigure(ctx,mid,plat.y,25,variant);
      else { drawDrift(ctx,mid-14,plat.y,16,variant); drawDrift(ctx,mid+15,plat.y,14,variant); }
      drawIcicleStudy(ctx,mid,plat.y+plat.height,9,variant);
    } else if (plat.width>=140) {
      drawFir(ctx,mid-12,plat.y,30,variant,i);
      if(i%3===1) drawSnowFigure(ctx,mid+28,plat.y,24,variant);
      else drawDrift(ctx,mid+24,plat.y,16,variant);
    } else if (plat.width>=80) {
      if(i%3===1) drawSnowFigure(ctx,mid,plat.y,24,variant);
      else drawFir(ctx,mid,plat.y,22,variant,i);
    }
  }
  const bridge=floats.find(p=>p.width>=350);
  if(bridge) for(let i=0;i<6;i++) drawIcicleStudy(ctx,bridge.x+30+i*60,bridge.y+bridge.height,8+(i%3)*2,variant);
}

export function drawPropStudyFront(ctx: Ctx2D, arena: Arena, variant: PropVariant): void {
  const ground=arena.platforms[0]; const y=ground.y;
  drawFir(ctx,50,y,65,variant,5);
  drawFir(ctx,1230,y,55,variant,6);
  for(const plat of getFloatingPlatforms(arena.platforms)) if(plat.width>=350) drawFir(ctx,plat.x+plat.width*.45,plat.y,28,variant,7);
  drawSnowballPile(ctx,850,y,variant);
  drawBush(ctx,350,y,34,variant);
  drawBush(ctx,960,y,30,variant);
  drawDrift(ctx,15,y,45,variant);
  drawDrift(ctx,1250,y,40,variant);
}
