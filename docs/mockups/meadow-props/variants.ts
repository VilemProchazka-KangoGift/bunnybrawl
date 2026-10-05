import type { Ctx2D, Platform } from '../../../src/engine/types';

/** Standalone art studies. Foreground foliage intentionally remains fully opaque. */
export interface PropStudy {
  name: string;
  summary: string;
  drawBush(ctx: Ctx2D, x: number, groundY: number, size: number, foreground: boolean): void;
  drawFlower(ctx: Ctx2D, x: number, groundY: number, color: string, height?: number): void;
  drawMushroom(ctx: Ctx2D, x: number, groundY: number): void;
  drawPlatform(ctx: Ctx2D, p: Platform, isGround: boolean): void;
}

const TAU = Math.PI * 2;
function oval(c: Ctx2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0) {
  c.fillStyle = color;
  c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, TAU); c.fill();
}
function leaf(c: Ctx2D, x: number, y: number, length: number, angle: number, color: string, ink = false) {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.fillStyle = color; c.beginPath(); c.moveTo(0, 0);
  c.bezierCurveTo(length * .1, -length * .48, length * .65, -length * .36, length, 0);
  c.bezierCurveTo(length * .65, length * .32, length * .2, length * .3, 0, 0); c.fill();
  if (ink) { c.strokeStyle = '#244c3d'; c.lineWidth = .7; c.stroke(); }
  c.strokeStyle = ink ? '#e1e1a9' : '#b9d778'; c.lineWidth = .7;
  c.beginPath(); c.moveTo(length * .18, 0); c.lineTo(length * .78, -.5); c.stroke(); c.restore();
}

function bush(c: Ctx2D, x: number, gy: number, size: number, fg: boolean, ink: boolean) {
  c.save(); c.translate(x, gy); c.scale(size / 50, size / 50);
  // A joined, scalloped silhouette gives the same hiding volume as the original 0.7s × 0.85s bush.
  c.fillStyle = ink ? '#244d3d' : fg ? '#285c49' : '#4c7860';
  c.beginPath(); c.moveTo(-34, 1);
  c.bezierCurveTo(-39, -12, -34, -26, -23, -27);
  c.bezierCurveTo(-24, -39, -9, -45, 0, -39);
  c.bezierCurveTo(11, -48, 26, -35, 24, -29);
  c.bezierCurveTo(38, -29, 41, -9, 33, 1);
  c.quadraticCurveTo(0, 7, -34, 1); c.fill();
  if (ink) { c.strokeStyle = '#183b32'; c.lineWidth = 1.6; c.stroke(); }
  const crowns = [[-20,-22,15,13],[-6,-31,16,12],[15,-29,13,12],[25,-15,13,12],[-4,-15,21,14]];
  for (let i = 0; i < crowns.length; i++) {
    const [cx, cy, rx, ry] = crowns[i];
    oval(c,cx,cy,rx,ry,ink ? ['#628154','#839a61','#739057','#57774c','#597e50'][i] : ['#538952','#79a05b','#669452','#467849','#4b8552'][i]);
  }
  // Deliberately grouped highlights, not a uniform field of tiny marks.
  for (let i = 0; i < 17; i++) {
    const lx = -28 + (i * 17 % 55), ly = -9 - (i * 11 % 25);
    leaf(c, lx, ly, 6 + i % 4, -.8 + (i % 3) * .65,
      ink ? (i % 2 ? '#adc17c' : '#91a665') : (i % 3 ? '#85b367' : '#aec976'), ink);
  }
  if (ink) {
    c.strokeStyle = '#bed08a'; c.lineWidth = 1;
    for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(-25+i*7,-6); c.lineTo(-28+i*7,-12-(i%3)*2); c.stroke(); }
  }
  for (const [bx, by] of [[-17,-15],[12,-19],[20,-10]]) {
    oval(c,bx,by,2.4,2.7, ink ? '#d68b5c' : '#d98179');
    oval(c,bx-.65,by-1,.8,.7,'#f7c6a0');
  }
  c.restore();
}

function flower(c: Ctx2D, x: number, gy: number, color: string, h: number, ink: boolean) {
  c.save(); c.lineCap = 'round';
  c.strokeStyle = ink ? '#294e3d' : '#5c8050'; c.lineWidth = ink ? 1.7 : 1.5;
  c.beginPath(); c.moveTo(x,gy); c.quadraticCurveTo(x-3,gy-h*.5,x+1,gy-h); c.stroke();
  leaf(c,x-1,gy-h*.3,7,-2.65,ink?'#7a975a':'#86a566',ink);
  leaf(c,x-1,gy-h*.58,6,-.5,ink?'#9bb471':'#a5bf77',ink);
  c.save(); c.translate(x+1,gy-h);
  for (let i = 0; i < 6; i++) {
    c.rotate(TAU/6); c.fillStyle=color;
    c.beginPath(); c.moveTo(0,-1); c.bezierCurveTo(-4,-3,-3.7,-8,0,-7.5); c.bezierCurveTo(3.8,-8,4,-3,0,-1); c.fill();
    if (ink) { c.strokeStyle='#534736'; c.lineWidth=.75; c.stroke(); }
    else { c.strokeStyle='#fff5cf'; c.globalAlpha=.5; c.lineWidth=1; c.beginPath(); c.moveTo(-1,-4); c.lineTo(-1,-6); c.stroke(); c.globalAlpha=1; }
  }
  oval(c,0,0,2.7,2.6,ink?'#c78939':'#cf9845'); oval(c,-.5,-.6,1.8,1.5,'#f7db86');
  c.restore(); c.restore();
}

function mushroom(c: Ctx2D, x: number, gy: number, ink: boolean) {
  c.save(); c.translate(x,gy);
  c.fillStyle=ink?'#f0d8a6':'#e3d9b2'; c.beginPath(); c.moveTo(-2,-12); c.lineTo(2,-12); c.quadraticCurveTo(2,-5,4,0); c.quadraticCurveTo(0,2,-3,0); c.closePath(); c.fill();
  if(ink){c.strokeStyle='#574b33';c.lineWidth=1;c.stroke();}
  oval(c,0,-10,9,2.7,ink?'#7e4934':'#a05d4b');
  c.fillStyle=ink?'#bc6645':'#ce7c66'; c.beginPath(); c.moveTo(-10,-11); c.bezierCurveTo(-8,-23,7,-23,10,-11); c.quadraticCurveTo(0,-7,-10,-11); c.fill();
  if(ink){c.strokeStyle='#573c30';c.stroke();}
  for(const [px,py,r] of [[-4,-15,1.6],[2,-17,1.9],[6,-12,1],[-6,-12,1]]) oval(c,px,py,r,r*.65,'#f4dfb1');
  c.restore();
}

function platform(c: Ctx2D, p: Platform, ground: boolean, ink: boolean) {
  const {x,y,width:w,height:h}=p;
  c.save(); c.lineJoin='round'; c.lineCap='round';
  if(p.style==='stump') {
    c.fillStyle=ink?'#956a43':'#92714f';
    c.beginPath(); c.moveTo(x+3,y+2); c.lineTo(x+w-3,y+2); c.lineTo(x+w-1,y+h-5); c.lineTo(x+w+3,y+h); c.lineTo(x-3,y+h); c.lineTo(x+1,y+h-7); c.closePath();c.fill();
    if(ink){c.strokeStyle='#493e30';c.lineWidth=1.6;c.stroke();}
    for(let i=0;i<5;i++) {
      const bx=x+6+i*(w-12)/4; c.strokeStyle=i%2?'#b89061':'#674c37'; c.lineWidth=ink?2:3;
      c.beginPath();c.moveTo(bx,y+8);c.bezierCurveTo(bx-3,y+h*.4,bx+3,y+h*.65,bx-1,y+h-3);c.stroke();
    }
    oval(c,x+w*.65,y+h*.55,3.5,6,'#634c36'); oval(c,x+w*.65,y+h*.55,1.5,3,'#b18c5e');
    oval(c,x+w/2,y+1,w/2,5.5,ink?'#e1bd7b':'#d3b37e');
    c.strokeStyle=ink?'#715535':'#a08356'; c.lineWidth=ink?1:.8;
    for(let i=1;i<=3;i++){c.beginPath();c.ellipse(x+w*.48,y+1,w*.13*i,1.2*i,0,0,TAU);c.stroke();}
    leaf(c,x+2,y+h-2,9,-.5,'#739456',ink); leaf(c,x+w-7,y+h-1,8,-2,'#8baa64',ink);
    c.restore();return;
  }
  c.fillStyle=ink?'#705441':'#8c7056';c.fillRect(x,y+3,w,h-3);
  // Restrained bands describe strata while preserving a crisp landing plane.
  c.fillStyle=ink?'#584739':'#715b49';c.fillRect(x,y+h*.62,w,h*.38);
  c.fillStyle=ink?'#937044':'#a68861';c.fillRect(x,y+9,w,4);
  for(let i=0;i<Math.floor(w/22);i++) {
    const sx=x+11+i*22,sy=y+18+(i*13%Math.max(1,h-23));
    oval(c,sx,sy,3+(i%3),1.6,ink?'#c4a570':'#b39c78',-.3);
    if(ink){c.strokeStyle='#463f34';c.lineWidth=.8;c.beginPath();c.moveTo(sx-5,sy+4);c.lineTo(sx+1,sy+2);c.stroke();}
  }
  c.fillStyle=ink?'#446543':'#537a4c';c.beginPath();c.moveTo(x,y);c.lineTo(x+w,y);c.lineTo(x+w,y+8);
  for(let i=Math.ceil(w/12);i>=0;i--){const px=x+Math.min(w,i*12);c.lineTo(px,y+8+(i%3)*2);}
  c.lineTo(x,y);c.fill();
  c.fillStyle=ink?'#9cb16b':'#9fb96e';c.fillRect(x,y,w,3);
  if(ink){c.strokeStyle='#304938';c.lineWidth=1.2;c.strokeRect(x,y,w,h);}
  c.strokeStyle=ink?'#d4d49a':'#c8d78d';c.lineWidth=1;
  for(let i=0;i<Math.floor(w/18);i++){const tx=x+8+i*18;c.beginPath();c.moveTo(tx,y+3);c.lineTo(tx+3,y+1);c.stroke();}
  if(!ground) {
    c.strokeStyle=ink?'#5e4b36':'#776346';c.lineWidth=1.3;
    for(let i=0;i<3;i++){const rx=x+w*(.2+i*.29);c.beginPath();c.moveTo(rx,y+h);c.quadraticCurveTo(rx-4,y+h+5,rx+1,y+h+8-i*2);c.stroke();}
  }
  c.restore();
}

export const studies: Record<'storybook' | 'woodcut', PropStudy> = {
  storybook: {
    name: 'Garden storybook',
    summary: 'Soft sage foliage, broad painted light, coral berries and warm earthen ledges.',
    drawBush: (c,x,y,s,f)=>bush(c,x,y,s,f,false),
    drawFlower: (c,x,y,color,h=20)=>flower(c,x,y,color,h,false),
    drawMushroom: (c,x,y)=>mushroom(c,x,y,false),
    drawPlatform: (c,p,g)=>platform(c,p,g,false),
  },
  woodcut: {
    name: 'Field-guide woodcut',
    summary: 'Olive and ochre print colors, dark ink edges, carved leaf veins and graphic soil strata.',
    drawBush: (c,x,y,s,f)=>bush(c,x,y,s,f,true),
    drawFlower: (c,x,y,color,h=22)=>flower(c,x,y,color,h,true),
    drawMushroom: (c,x,y)=>mushroom(c,x,y,true),
    drawPlatform: (c,p,g)=>platform(c,p,g,true),
  },
};
