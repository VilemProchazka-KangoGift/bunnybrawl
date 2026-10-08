import type { Arena, Ctx2D } from '../../types';
import { CANVAS_WIDTH } from '../../constants';
import { getFloatingPlatforms } from '../../themes/utils';
import { drawMeadowBushStyle } from './meadowSelectedArt';
import { getWinterPropArt } from '../illustratedBackdropAsset';

// Round Grove is authored as paths at a small reference size. The generated
// painting in docs/mockups/winter-props is an art-direction reference only.
const INK = '#263e4d';
const PINE_DARK = '#214e4e';
const PINE_MID = '#2d7567';
const SNOW = '#f7faf6';
const SNOW_SHADE = '#b6d5df';
const ICE = '#68b6ca';
export type IglooVariant = 'blue-brick' | 'snow-stone' | 'arched-door';

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

function snowOval(ctx: Ctx2D, x: number, y: number, rx: number, ry: number): void {
  const shade=ctx.createRadialGradient(x-rx*.42,y-ry*.55,2,x+rx*.28,y+ry*.12,rx*1.8);
  shade.addColorStop(0,'#ffffff');
  shade.addColorStop(.52,'#f0f8f7');
  shade.addColorStop(1,'#a5cbd7');
  ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  ctx.fillStyle=shade; ctx.fill();
  ctx.strokeStyle=INK; ctx.lineWidth=1.6; ctx.stroke();
  mark(ctx,[[x-rx*.58,y-ry*.1],[x-rx*.42,y-ry*.48],[x-rx*.06,y-ry*.68]],'#ffffff',1.4);
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
  ctx.save(); ctx.clip();
  ctx.beginPath(); ctx.moveTo(shift + 3,y-rise+3);
  ctx.bezierCurveTo(right-16,y-rise+12,right+2,y-15,right+3,y+9);
  ctx.lineTo(shift+2,y+12); ctx.closePath();
  ctx.fillStyle='#173f45'; ctx.globalAlpha=.46; ctx.fill(); ctx.globalAlpha=1;
  ctx.beginPath(); ctx.moveTo(left+7,y-3);
  ctx.quadraticCurveTo(shift-8,y+3,right-3,y-4);
  ctx.strokeStyle='#8bb5a1'; ctx.lineWidth=1.35; ctx.stroke();
  ctx.restore();

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
  ctx.save(); ctx.clip();
  ctx.beginPath(); ctx.moveTo(shift+1,y-rise+1);
  ctx.bezierCurveTo(right-13,y-rise+8,right-4,y-12,right+1,y-5);
  ctx.lineTo(right+1,y+4); ctx.lineTo(shift-5,y+4); ctx.closePath();
  ctx.fillStyle=SNOW_SHADE; ctx.globalAlpha=.63; ctx.fill(); ctx.globalAlpha=1;
  ctx.restore();
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

function bush(ctx: Ctx2D, x: number, baseY: number, size: number, style: 0 | 1): void {
  const image = style === 0 ? getWinterPropArt().leafy : getWinterPropArt().hedge;
  if (image) {
    const width = style === 0 ? 151 : 153;
    const height = style === 0 ? 73 : 72;
    // The painted foliage is dense enough to provide cover without a backing
    // shape that could protrude beyond its transparent silhouette.
    // The source painting includes a little transparent padding at its base.
    // Set the visible leaves on the ground so feet cannot peek below cover.
    ctx.drawImage(image,x-width/2,baseY-height+6,width,height);
    return;
  }
  // Meadow's connected silhouette is already proven at gameplay scale.
  drawMeadowBushStyle(ctx,x,baseY,size,style,true);
  ctx.save(); ctx.translate(x,baseY); ctx.scale(size/50,size/50);
  // Snow rests on the crown, leaving the leaves and berries readable.
  for(const [sx,sy,rx,ry] of [[-22,-30,11,5],[-3,-38,13,5],[18,-29,11,5]] as const) {
    ctx.beginPath(); ctx.moveTo(sx-rx,sy+2);
    ctx.bezierCurveTo(sx-rx*.8,sy-ry*.7,sx-rx*.3,sy-ry*1.5,sx,sy-ry);
    ctx.bezierCurveTo(sx+rx*.45,sy-ry*1.35,sx+rx,sy-ry*.2,sx+rx,sy+2);
    ctx.bezierCurveTo(sx+rx*.4,sy+ry*.5,sx-rx*.6,sy+ry*.4,sx-rx,sy+2);
    ctx.closePath(); shape(ctx,SNOW,'#65828c',.75);
    mark(ctx,[[sx-rx*.4,sy-ry*.45],[sx,sy-ry*.75]],'#ffffff',1.25);
  }
  for(const [fx,fy] of [[-29,-16],[-13,-20],[11,-17],[25,-13]] as const) {
    oval(ctx,fx,fy,1.3,1.1,'#e4f3ef');
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
  snowOval(ctx,0,-19,20,20);
  snowOval(ctx,1,-52,15,15);
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

function igloo(ctx: Ctx2D, x: number, baseY: number, width: number, height: number, variant: IglooVariant): void {
  ctx.save(); ctx.translate(x, baseY); ctx.scale(width / 180, height / 100);
  const body=ctx.createLinearGradient(0,-95,0,8);
  if(variant==='snow-stone') {
    body.addColorStop(0,'#f8faf5'); body.addColorStop(.48,'#d5e8e9'); body.addColorStop(1,'#8bbdcc');
  } else if(variant==='arched-door') {
    body.addColorStop(0,'#d7f0ed'); body.addColorStop(.5,'#78bac7'); body.addColorStop(1,'#3a87a7');
  } else {
    body.addColorStop(0,'#b7e7e9'); body.addColorStop(.5,'#74bdd0'); body.addColorStop(1,'#4294b2');
  }
  // The whole shelter is one rounded dome, rather than a tent-shaped cap.
  ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(6,-48,35,-86,82,-92);
  ctx.bezierCurveTo(130,-98,169,-58,180,0); ctx.closePath();
  ctx.fillStyle=body; ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=2.6; ctx.stroke();
  ctx.save(); ctx.clip();
  // Broad curved courses and offset joints read as hand-built snow blocks.
  const seam=variant==='snow-stone' ? '#90b9c5' : '#bfe5e7';
  for(const [ax,ay,bx,by] of [[9,-25,171,-24],[26,-48,155,-49],[52,-69,130,-71]] as const) {
    ctx.beginPath(); ctx.moveTo(ax,ay);
    ctx.quadraticCurveTo(90,ay+5,bx,by);
    ctx.strokeStyle=seam; ctx.lineWidth=2.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax,ay+3); ctx.quadraticCurveTo(90,ay+8,bx,by+3);
    ctx.strokeStyle='#477b91'; ctx.lineWidth=.8; ctx.stroke();
  }
  for(const [ax,ay,bx,by] of [[43,-47,41,-25],[96,-47,96,-24],[145,-48,145,-25],
    [68,-69,70,-48],[121,-69,119,-48],[65,-25,62,2],[126,-25,130,2]] as const) {
    mark(ctx,[[ax,ay],[bx,by]],seam,1.9);
  }
  // A few uneven reflective facets provide material texture without a grid.
  for(const [x0,y0,x1,y1] of [[19,-17,35,-13],[52,-38,69,-36],[122,-39,138,-36],[34,-59,49,-56],[91,-59,106,-58]] as const) {
    mark(ctx,[[x0,y0],[x1,y1]],'#ebfaf5',2.2);
  }
  ctx.restore();

  const door=variant==='arched-door' ? 125 : 100;
  const doorHalf=variant==='arched-door' ? 27 : 25;
  ctx.beginPath(); ctx.moveTo(door-doorHalf-5,0);
  ctx.bezierCurveTo(door-doorHalf-5,-31,door-17,-54,door,-57);
  ctx.bezierCurveTo(door+18,-57,door+doorHalf+5,-32,door+doorHalf+5,0);
  ctx.closePath(); shape(ctx,variant==='snow-stone'?'#86b8c6':'#3986a2',INK,2.2);
  ctx.beginPath(); ctx.moveTo(door-doorHalf+5,0);
  ctx.bezierCurveTo(door-doorHalf+5,-27,door-12,-44,door,-46);
  ctx.bezierCurveTo(door+13,-46,door+doorHalf-5,-27,door+doorHalf-5,0);
  ctx.closePath(); shape(ctx,'#24485d',INK,1.3);
  mark(ctx,[[door-doorHalf-2,-5],[door-doorHalf-1,-31],[door-12,-48]],'#cdecee',2.4);
  // Snow forms several uneven ledges, leaving most blockwork visible.
  ctx.beginPath(); ctx.moveTo(20,-62);
  ctx.bezierCurveTo(42,-87,67,-96,83,-96);
  ctx.bezierCurveTo(108,-98,133,-86,153,-60);
  ctx.bezierCurveTo(137,-66,126,-69,116,-67);
  ctx.bezierCurveTo(105,-77,95,-77,86,-73);
  ctx.bezierCurveTo(69,-81,52,-73,44,-70);
  ctx.bezierCurveTo(34,-72,26,-67,20,-62); ctx.closePath(); shape(ctx,SNOW,INK,1.5);
  mark(ctx,[[49,-80],[71,-88],[90,-86]],'#ffffff',2.2);
  mark(ctx,[[116,-78],[132,-70]],SNOW_SHADE,1.3);
  oval(ctx,4,-3,14,6,SNOW,SNOW_SHADE,.8);
  oval(ctx,178,-3,12,6,SNOW,SNOW_SHADE,.8);
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

export function drawRoundGroveBackground(ctx: Ctx2D, arena: Arena, iglooVariant: IglooVariant = 'blue-brick'): void {
  const y=arena.platforms[0].y;
  const floats=getFloatingPlatforms(arena.platforms);
  // The ground landmarks sit in open intervals between the ice cubes and
  // cover bushes. In the old layout, shelves obscured both the igloo and snowman.
  // The left ground stays open for the spawn and the first bush.
  snowman(ctx,485,y,84,true);
  tree(ctx,615,y,56,2);
  const paintedIgloo = iglooVariant === 'blue-brick' ? getWinterPropArt().igloo : null;
  if (paintedIgloo) ctx.drawImage(paintedIgloo,690,y-91,194,91);
  else igloo(ctx,iglooVariant==='arched-door'?685:700,y,
    iglooVariant==='arched-door'?165:155,iglooVariant==='arched-door'?76:85,iglooVariant);
  tree(ctx,1195,y,58,3);

  const upperBridge=floats.find(p=>p.width>=350);
  if(upperBridge) {
    tree(ctx,upperBridge.x+34,upperBridge.y,46,4);
    snowman(ctx,upperBridge.x+112,upperBridge.y,39);
    tree(ctx,upperBridge.x+upperBridge.width-34,upperBridge.y,44,5);
    for(let i=0;i<5;i++) icicle(ctx,upperBridge.x+44+i*76,upperBridge.y+upperBridge.height,8+(i%3)*2);
  }
  const lowerBridge=floats.find(p=>p.width>=200 && p.width<350);
  if(lowerBridge) {
    tree(ctx,lowerBridge.x+29,lowerBridge.y,39,6);
    snowman(ctx,lowerBridge.x+lowerBridge.width-31,lowerBridge.y,35);
    icicle(ctx,lowerBridge.x+lowerBridge.width*.5,lowerBridge.y+lowerBridge.height,10);
  }
  // A few shelf accents give scale; the tiny steps stay clear for players.
  for(const plat of floats) {
    if(plat.width>=85 && plat.width<110 && plat.y<500 && plat.x<400) {
      tree(ctx,plat.x+plat.width*.5,plat.y,29,8);
    }
    if(plat.width>=130 && plat.width<160 && plat.y>=500 && plat.y<550) {
      snowman(ctx,plat.x+plat.width*.5,plat.y,34);
    }
  }
}

function paintGroundForeground(ctx: Ctx2D, arena: Arena): void {
  const y=arena.platforms[0].y;
  bush(ctx,290,y,62,0); bush(ctx,1000,y,60,1);
  snowballs(ctx,1105,y);
  drift(ctx,15,y,45); drift(ctx,1250,y,40);
}

function paintForeground(ctx: Ctx2D, arena: Arena): void {
  paintGroundForeground(ctx,arena);
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
    foregroundCache.set(arena,pieces);
  }
  for(const piece of pieces) ctx.drawImage(piece.canvas,piece.x,piece.y,piece.width,piece.height);
}
