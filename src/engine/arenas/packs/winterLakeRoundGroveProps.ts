import type { Arena, Ctx2D } from '../../types';
import { CANVAS_WIDTH } from '../../constants';
import { getFloatingPlatforms } from '../../themes/utils';

// Round Grove is authored as paths at a small reference size. The generated
// painting in docs/mockups/winter-props is an art-direction reference only.
const INK = '#263e4d';
const PINE_DARK = '#214e4e';
const PINE_MID = '#2d7567';
const PINE_LIGHT = '#4c9381';
const SNOW = '#f7faf6';
const SNOW_SHADE = '#b6d5df';
const ICE = '#68b6ca';

function shape(ctx: Ctx2D, fill: string, line = INK, width = 1.5): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function oval(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, fill: string, line?: string, width = 1): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (line) { ctx.strokeStyle = line; ctx.lineWidth = width; ctx.stroke(); }
}

function mark(ctx: Ctx2D, points: readonly [number, number][], color: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// Each tier has a broad, irregular lower edge; the upper snow is a thick mass,
// not the thin repeated ribbon from the first Canvas sketch.
function bough(ctx: Ctx2D, y: number, halfWidth: number, rise: number, shift: number, tint: string): void {
  const left = shift - halfWidth;
  const right = shift + halfWidth;
  ctx.beginPath();
  ctx.moveTo(shift - 2, y - rise);
  ctx.bezierCurveTo(shift - halfWidth * .22, y - rise + 1, left + 10, y - 7, left, y - 2);
  ctx.bezierCurveTo(left - 3, y + 2, left + 3, y + 5, left + 8, y + 3);
  ctx.quadraticCurveTo(left + 13, y + 9, left + 19, y + 5);
  ctx.quadraticCurveTo(left + 25, y + 10, shift - 3, y + 5);
  ctx.quadraticCurveTo(shift + 10, y + 11, right - 19, y + 5);
  ctx.quadraticCurveTo(right - 8, y + 8, right - 7, y + 2);
  ctx.quadraticCurveTo(right + 5, y + 2, right, y - 3);
  ctx.bezierCurveTo(right - 10, y - 8, shift + halfWidth * .21, y - rise + 1, shift - 2, y - rise);
  ctx.closePath();
  shape(ctx, tint, INK, 1.6);

  ctx.beginPath();
  ctx.moveTo(left + 3, y - 7);
  ctx.bezierCurveTo(left + 5, y - 15, left + 12, y - 19, left + 18, y - 17);
  ctx.bezierCurveTo(left + 22, y - 24, shift - 5, y - rise - 4, shift + 1, y - rise + 1);
  ctx.bezierCurveTo(shift + 8, y - rise - 3, right - 21, y - 21, right - 16, y - 16);
  ctx.bezierCurveTo(right - 7, y - 17, right - 3, y - 12, right - 2, y - 7);
  ctx.bezierCurveTo(right - 5, y - 3, right - 11, y - 6, right - 14, y - 5);
  ctx.bezierCurveTo(right - 18, y - 1, right - 23, y - 1, right - 27, y - 7);
  ctx.bezierCurveTo(shift + 1, y - 3, shift - 4, y - 6, shift - 8, y - 8);
  ctx.bezierCurveTo(left + 17, y - 2, left + 10, y - 3, left + 8, y - 7);
  ctx.closePath();
  shape(ctx, SNOW, '#426273', 1.15);
  mark(ctx, [[left + 10, y - 12], [left + 17, y - 15], [left + 26, y - 14]], '#ffffff', 1.6);
  mark(ctx, [[shift + 3, y - rise + 5], [shift + 10, y - rise + 7]], '#ffffff', 1.2);
  mark(ctx, [[right - 15, y - 8], [right - 11, y - 7]], SNOW_SHADE, 1.2);
}

function tree(ctx: Ctx2D, x: number, baseY: number, height: number, seed: number): void {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(height / 80 * (seed % 3 === 0 ? 1.08 : .96), height / 80);
  if (seed % 2) ctx.scale(-1, 1);
  // Trunk and shaded core remain attached beneath the broad snow boughs.
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-5, -34); ctx.lineTo(5, -34); ctx.lineTo(7, 0); ctx.closePath();
  shape(ctx, '#725a4b', INK, 1.3);
  ctx.beginPath(); ctx.moveTo(0, -73); ctx.bezierCurveTo(-20, -58, -18, -33, -25, -14);
  ctx.quadraticCurveTo(0, -8, 26, -14); ctx.bezierCurveTo(18, -35, 18, -58, 0, -73); ctx.closePath();
  shape(ctx, PINE_DARK, INK, 1.7);
  bough(ctx, -18, 35, 29, seed % 4 - 2, PINE_MID);
  bough(ctx, -41, 27, 26, seed % 3, PINE_DARK);
  bough(ctx, -61, 18, 20, seed % 2 - 1, PINE_MID);
  // Short clustered needles create texture without becoming a row of triangles.
  for (const [mx, my] of [[-20,-20],[-11,-29],[15,-22],[-16,-41],[12,-45],[-7,-57],[7,-58]] as const) {
    mark(ctx, [[mx-2,my],[mx,my+2],[mx+3,my]], '#5c9f8d', 1.05);
  }
  ctx.restore();
}

function bush(ctx: Ctx2D, x: number, baseY: number, size: number, seed: number): void {
  ctx.save(); ctx.translate(x, baseY); ctx.scale(size / 34 * 1.15, size / 34 * 1.2);
  if (seed % 2) ctx.scale(-1, 1);
  // One opaque connected leaf body protects the deliberate hiding mechanic.
  ctx.beginPath(); ctx.moveTo(-35, 0);
  ctx.bezierCurveTo(-39,-8,-34,-17,-29,-19);
  ctx.bezierCurveTo(-31,-29,-22,-32,-16,-30);
  ctx.bezierCurveTo(-12,-37,-2,-39,5,-33);
  ctx.bezierCurveTo(14,-37,25,-31,27,-23);
  ctx.bezierCurveTo(37,-19,38,-8,35,0); ctx.closePath();
  shape(ctx, PINE_DARK, INK, 2);
  // Interlocking leaf planes add volume but never make alpha holes.
  oval(ctx,-23,-10,14,11,PINE_MID); oval(ctx,-12,-22,13,10,PINE_MID);
  oval(ctx,8,-25,16,10,PINE_MID); oval(ctx,23,-13,14,11,PINE_MID);
  oval(ctx,-2,-8,19,11,'#25645b');
  for (const [mx,my] of [[-29,-14],[-22,-8],[-9,-17],[9,-15],[20,-9],[28,-15]] as const) {
    mark(ctx,[[mx-2,my],[mx,my-3],[mx+4,my-2]],PINE_LIGHT,1.7);
  }
  // Separate lumpy snow pillows follow foliage; dark leaves remain prominent.
  for (const [sx,sy,rx,ry] of [[-23,-25,10,6],[-6,-32,14,7],[16,-29,13,7],[29,-18,7,4],[-29,-15,6,4]] as const) {
    ctx.beginPath(); ctx.moveTo(sx-rx,sy+2);
    ctx.bezierCurveTo(sx-rx,sy-ry*.8,sx-rx*.45,sy-ry*1.4,sx,sy-ry);
    ctx.bezierCurveTo(sx+rx*.5,sy-ry*1.2,sx+rx,sy-ry*.3,sx+rx,sy+2);
    ctx.bezierCurveTo(sx+rx*.5,sy+ry*.4,sx-rx*.4,sy+ry*.35,sx-rx,sy+2);
    ctx.closePath(); shape(ctx,SNOW,'#476576',.9);
    mark(ctx,[[sx-rx*.45,sy-ry*.45],[sx-rx*.12,sy-ry*.7]],'#ffffff',1.4);
  }
  for (const [bx,by] of [[-27,-7],[-15,-13],[3,-15],[18,-7],[29,-9]] as const) {
    oval(ctx,bx,by,1.7,1.8,'#bd6870',INK,.4);
  }
  ctx.restore();
}

function snowman(ctx: Ctx2D, x: number, baseY: number, height: number, arms = false): void {
  ctx.save(); ctx.translate(x, baseY); ctx.scale(height / 80, height / 80);
  if (arms) {
    mark(ctx,[[-11,-37],[-22,-43],[-29,-52]],'#77573c',2.4);
    mark(ctx,[[11,-37],[24,-42],[30,-49]],'#77573c',2.4);
    mark(ctx,[[-27,-49],[-32,-50]],'#77573c',1.5);
    mark(ctx,[[27,-46],[33,-45]],'#77573c',1.5);
  }
  oval(ctx,0,-19,20,20,'#d7e9ef',INK,1.7);
  oval(ctx,-4,-24,14,11,SNOW);
  oval(ctx,1,-52,15,15,SNOW,INK,1.6);
  oval(ctx,-5,-56,6,4,'#ffffff');
  // Scarf has a visible wrapped band and hanging end at both large and small sizes.
  ctx.beginPath(); ctx.moveTo(-13,-43); ctx.quadraticCurveTo(0,-39,14,-44);
  ctx.lineTo(13,-37); ctx.quadraticCurveTo(0,-33,-13,-38); ctx.closePath();
  shape(ctx,'#ba5961',INK,1.1);
  ctx.beginPath(); ctx.moveTo(7,-37); ctx.lineTo(10,-20); ctx.lineTo(16,-22); ctx.lineTo(14,-39); ctx.closePath();
  shape(ctx,'#aa4653',INK,.9);
  oval(ctx,-4,-54,1.4,1.6,INK); oval(ctx,6,-54,1.4,1.6,INK);
  ctx.beginPath(); ctx.moveTo(2,-51); ctx.lineTo(12,-48); ctx.lineTo(2,-46); ctx.closePath();
  shape(ctx,'#dc8e42',INK,.7);
  oval(ctx,-2,-25,1.4,1.4,INK); oval(ctx,1,-17,1.4,1.4,INK);
  ctx.restore();
}

function igloo(ctx: Ctx2D, x: number, baseY: number, width: number, height: number): void {
  ctx.save(); ctx.translate(x, baseY); ctx.scale(width / 180, height / 100);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(4,-46,31,-85,80,-90);
  ctx.bezierCurveTo(128,-94,162,-60,180,0); ctx.closePath();
  shape(ctx,'#64aec4',INK,2.1);
  // Faceted block planes, clipped inside a connected dome.
  ctx.save(); ctx.clip();
  ctx.beginPath(); ctx.moveTo(11,-29); ctx.quadraticCurveTo(78,-16,163,-28);
  ctx.lineTo(180,5); ctx.lineTo(0,5); ctx.closePath(); ctx.fillStyle='#468fae'; ctx.fill();
  for (const [ax,ay,bx,by] of [[17,-25,61,-24],[65,-24,113,-26],[117,-26,162,-24],[30,-50,80,-46],[84,-47,133,-50],[55,-68,105,-65]] as const) {
    mark(ctx,[[ax,ay],[Math.round((ax+bx)/2),Math.round((ay+by)/2)-2],[bx,by]],'#d1eced',1.6);
  }
  for (const [ax,ay,bx,by] of [[46,-46,44,-25],[99,-47,98,-25],[139,-48,142,-25],[70,-66,71,-48]] as const) {
    mark(ctx,[[ax,ay],[bx,by]],'#d0e9ea',1.4);
  }
  ctx.restore();
  // Deep inset doorway is the landmark's dominant focal point.
  ctx.beginPath(); ctx.moveTo(100,0); ctx.bezierCurveTo(102,-36,115,-53,136,-55);
  ctx.bezierCurveTo(159,-55,172,-32,173,0); ctx.closePath(); shape(ctx,'#397e9a',INK,2);
  ctx.beginPath(); ctx.moveTo(112,0); ctx.bezierCurveTo(114,-28,121,-41,136,-43);
  ctx.bezierCurveTo(151,-43,159,-24,160,0); ctx.closePath(); shape(ctx,'#26495e',INK,1.1);
  // One thick, uneven roof of snow rather than a white dome overlay.
  ctx.beginPath(); ctx.moveTo(4,-33); ctx.bezierCurveTo(19,-70,46,-92,80,-94);
  ctx.bezierCurveTo(113,-98,144,-79,161,-50);
  ctx.bezierCurveTo(147,-54,137,-59,126,-57);
  ctx.bezierCurveTo(119,-60,114,-68,108,-66);
  ctx.bezierCurveTo(88,-75,73,-73,60,-67);
  ctx.bezierCurveTo(43,-67,26,-51,4,-33); ctx.closePath(); shape(ctx,SNOW,INK,1.8);
  mark(ctx,[[35,-64],[54,-76],[73,-79]],'#ffffff',2);
  mark(ctx,[[103,-82],[125,-74],[141,-61]],SNOW_SHADE,1.2);
  // Snow at the entrance and a few shallow foreground lumps.
  oval(ctx,8,-3,16,7,SNOW,SNOW_SHADE,.8);
  oval(ctx,181,-3,13,6,SNOW,SNOW_SHADE,.8);
  ctx.restore();
}

function snowballs(ctx: Ctx2D, x: number, baseY: number): void {
  const balls = [[-29,-9,10],[-10,-9,11],[10,-9,10],[30,-8,8],[-19,-26,10],[1,-26,11],[20,-25,10],[0,-43,11]] as const;
  for (const [dx,dy,r] of balls) {
    oval(ctx,x+dx,baseY+dy,r,r*.94,'#d6edf2',INK,1.2);
    oval(ctx,x+dx-2,baseY+dy-2,r*.65,r*.6,SNOW);
    mark(ctx,[[x+dx+r*.35,baseY+dy+2],[x+dx+r*.65,baseY+dy+4]],SNOW_SHADE,1);
  }
}

function drift(ctx: Ctx2D, x: number, y: number, width: number): void {
  ctx.beginPath(); ctx.moveTo(x-width/2,y);
  ctx.bezierCurveTo(x-width*.38,y-8,x-width*.17,y-7,x,y-3);
  ctx.bezierCurveTo(x+width*.13,y-9,x+width*.35,y-8,x+width/2,y);
  ctx.closePath(); ctx.fillStyle=SNOW; ctx.fill();
}

function icicle(ctx: Ctx2D, x: number, y: number, length: number): void {
  ctx.beginPath(); ctx.moveTo(x-2,y); ctx.lineTo(x+2,y);
  ctx.quadraticCurveTo(x+1,y+length*.55,x,y+length);
  ctx.quadraticCurveTo(x-1,y+length*.55,x-2,y);
  shape(ctx,ICE,'#46758a',.65);
}

export function drawRoundGroveBackground(ctx: Ctx2D, arena: Arena): void {
  const ground = arena.platforms[0]; const y = ground.y;
  const floats = getFloatingPlatforms(arena.platforms);
  snowman(ctx,55,y,90,true); igloo(ctx,1090,y,145,80);
  tree(ctx,200,y,75,1); tree(ctx,640,y,55,2); tree(ctx,1200,y,60,3);
  snowman(ctx,530,y,32);
  for (let i=0;i<floats.length;i++) {
    const plat=floats[i]; const mid=plat.x+plat.width/2;
    if (plat.width>=350) {
      tree(ctx,plat.x+35,plat.y,45,i); tree(ctx,plat.x+plat.width*.35,plat.y,38,i+2);
      snowman(ctx,plat.x+plat.width*.58,plat.y,26);
      tree(ctx,plat.x+plat.width-35,plat.y,42,i+3);
      icicle(ctx,plat.x+60,plat.y+plat.height,10);
      icicle(ctx,plat.x+plat.width-60,plat.y+plat.height,11);
    } else if (plat.width>=200) {
      tree(ctx,plat.x+25,plat.y,38,i); tree(ctx,plat.x+plat.width-28,plat.y,32,i+1);
      if (i%2===0) snowman(ctx,mid,plat.y,25);
      else { drift(ctx,mid-14,plat.y,16); drift(ctx,mid+15,plat.y,14); }
      icicle(ctx,mid,plat.y+plat.height,9);
    } else if (plat.width>=140) {
      tree(ctx,mid-12,plat.y,30,i);
      if(i%3===1) snowman(ctx,mid+28,plat.y,24);
      else drift(ctx,mid+24,plat.y,16);
    } else if (plat.width>=80) {
      if(i%3===1) snowman(ctx,mid,plat.y,24);
      else tree(ctx,mid,plat.y,22,i);
    }
  }
  const bridge=floats.find(p=>p.width>=350);
  if(bridge) for(let i=0;i<6;i++) icicle(ctx,bridge.x+30+i*60,bridge.y+bridge.height,8+(i%3)*2);
}

function paintGroundForeground(ctx: Ctx2D, arena: Arena): void {
  const y=arena.platforms[0].y;
  tree(ctx,50,y,65,5); tree(ctx,1230,y,55,6);
  snowballs(ctx,850,y);
  bush(ctx,350,y,34,0); bush(ctx,960,y,30,1);
  drift(ctx,15,y,45); drift(ctx,1250,y,40);
}

function paintForeground(ctx: Ctx2D, arena: Arena): void {
  paintGroundForeground(ctx,arena);
  for(const plat of getFloatingPlatforms(arena.platforms)) if(plat.width>=350) tree(ctx,plat.x+plat.width*.45,plat.y,28,7);
}

type CachedPiece = { canvas: OffscreenCanvas; x: number; y: number; width: number; height: number };
const foregroundCache = new WeakMap<Arena, CachedPiece[]>();
const CACHE_SCALE = 2;

function makePiece(x: number, y: number, width: number, height: number, draw: (ctx: Ctx2D) => void): CachedPiece | null {
  const canvas = new OffscreenCanvas(width * CACHE_SCALE, height * CACHE_SCALE);
  const cctx = canvas.getContext('2d');
  if (!cctx) return null;
  cctx.scale(CACHE_SCALE,CACHE_SCALE);
  cctx.translate(-x,-y);
  draw(cctx);
  return { canvas, x, y, width, height };
}

export function drawRoundGroveForeground(ctx: Ctx2D, arena: Arena): void {
  if (typeof OffscreenCanvas === 'undefined') { paintForeground(ctx,arena); return; }
  let pieces=foregroundCache.get(arena);
  if (!pieces) {
    pieces=[];
    const groundTop=arena.platforms[0].y-110;
    const ground=makePiece(0,groundTop,CANVAS_WIDTH,110,cachedCtx=>paintGroundForeground(cachedCtx,arena));
    if (!ground) { paintForeground(ctx,arena); return; }
    pieces.push(ground);
    for(const plat of getFloatingPlatforms(arena.platforms)) if(plat.width>=350) {
      const x=plat.x+plat.width*.45;
      const piece=makePiece(x-30,plat.y-40,60,42,cachedCtx=>tree(cachedCtx,x,plat.y,28,7));
      if (!piece) { paintForeground(ctx,arena); return; }
      pieces.push(piece);
    }
    foregroundCache.set(arena,pieces);
  }
  for(const piece of pieces) ctx.drawImage(piece.canvas,piece.x,piece.y,piece.width,piece.height);
}
