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

type LeafStyle = 'botanical' | 'leafy' | 'animation' | 'leafyAiry' | 'leafyBloom' | 'leafyDusky';
const isLeafy = (style: LeafStyle) => style.startsWith('leafy');
interface InkPalette {
  ink: string; shade: string; mid: string; light: string; tip: string;
  earth: string; earthLight: string; side: string; cap: string; width: number;
}
const palettes: Record<LeafStyle, InkPalette> = {
  botanical: { ink:'#243e35', shade:'#244c3b', mid:'#527750', light:'#89a96c', tip:'#c5d58d', earth:'#97734d', earthLight:'#c3a06a', side:'#493c2f', cap:'#8cac66', width:1.15 },
  leafy: { ink:'#334937', shade:'#31523c', mid:'#6d8c4c', light:'#a3b966', tip:'#dfd992', earth:'#ad7953', earthLight:'#d5a77a', side:'#61422f', cap:'#a2bb67', width:1.5 },
  animation: { ink:'#173c39', shade:'#1f5b47', mid:'#388b57', light:'#77bd65', tip:'#c3e58c', earth:'#b07946', earthLight:'#e0b676', side:'#503f32', cap:'#8ec961', width:2.2 },
  leafyAiry: { ink:'#51634a', shade:'#496345', mid:'#8ca06a', light:'#bfcd8d', tip:'#e6e3b5', earth:'#b99170', earthLight:'#dcc1a0', side:'#79604a', cap:'#bbcb86', width:1.05 },
  leafyBloom: { ink:'#334b3e', shade:'#2e5240', mid:'#66895c', light:'#a0b779', tip:'#dce0a2', earth:'#ad805f', earthLight:'#d4ad84', side:'#674a38', cap:'#a4bc79', width:1.4 },
  leafyDusky: { ink:'#344a47', shade:'#354f49', mid:'#6a9186', light:'#a3bdb0', tip:'#dfdfb6', earth:'#b78968', earthLight:'#e1b898', side:'#705042', cap:'#9fb7a0', width:1.5 },
};

// Leaves, rather than ovals, define the silhouette at native game scale.
function inkLeaf(c: Ctx2D, x: number, y: number, length: number, angle: number, fill: string, style: LeafStyle) {
  const p = palettes[style];
  c.save(); c.translate(x,y); c.rotate(angle); c.fillStyle=fill;
  if(style==='leafyDusky') c.scale(1,.72);
  c.strokeStyle=p.ink; c.lineWidth=p.width; c.beginPath(); c.moveTo(0,0);
  if(style==='botanical') {
    c.bezierCurveTo(length*.22,-length*.26,length*.72,-length*.32,length,0);
    c.bezierCurveTo(length*.61,length*.28,length*.26,length*.2,0,0);
  } else if(isLeafy(style)) {
    c.bezierCurveTo(length*.04,-length*.38,length*.55,-length*.57,length*.82,-length*.21);
    c.quadraticCurveTo(length*.94,-length*.2,length,0);
    c.bezierCurveTo(length*.7,length*.46,length*.23,length*.46,0,0);
  } else {
    c.quadraticCurveTo(length*.3,-length*.55,length,0);
    c.quadraticCurveTo(length*.34,length*.59,0,0);
  }
  c.closePath(); c.fill(); c.stroke();
  c.strokeStyle=style==='animation'?p.tip:p.ink; c.lineWidth=style==='animation'?1.4:.75;
  c.beginPath(); c.moveTo(length*.16,0); c.lineTo(length*.77,0); c.stroke();
  if(style==='botanical') {
    c.beginPath(); c.moveTo(length*.37,0); c.lineTo(length*.52,-length*.13);
    c.moveTo(length*.55,0); c.lineTo(length*.69,length*.1); c.stroke();
  }
  c.restore();
}

function branchingBush(c: Ctx2D, x: number, gy: number, size: number, fg: boolean, style: LeafStyle) {
  const p=palettes[style]; c.save(); c.translate(x,gy); c.scale(size/50,size/50);
  c.globalAlpha=1; c.lineCap='round'; c.lineJoin='round';
  // Solid core keeps the original foreground hiding volume. Edge leaves cover
  // its perimeter, so it reads as dense vegetation rather than a smooth boulder.
  c.fillStyle=p.shade; c.strokeStyle=p.ink; c.lineWidth=p.width;
  c.beginPath(); c.moveTo(-34,0); c.lineTo(-33,-17); c.lineTo(-25,-25);
  c.lineTo(-18,-29); c.lineTo(-10,-37); c.lineTo(4,-38); c.lineTo(15,-32);
  c.lineTo(26,-26); c.lineTo(34,-16); c.lineTo(35,0); c.closePath(); c.fill(); c.stroke();
  const sprays = style==='leafyAiry'
    ? [[-24,-23,-2.45],[1,-34,-1.48],[26,-21,-.58]]
    : style==='leafyBloom'
      ? [[-26,-19,-2.65],[-10,-28,-1.98],[12,-27,-1.03],[29,-13,-.25]]
    : style==='leafyDusky'
      ? [[-23,-27,-1.8],[-8,-35,-1.65],[10,-35,-1.42],[27,-24,-1.22]]
    : style==='botanical'
    ? [[-25,-18,-2.28],[-12,-27,-1.96],[1,-31,-1.5],[13,-26,-1.06],[25,-17,-.57]]
    : isLeafy(style)
      ? [[-26,-14,-2.6],[-15,-26,-2.08],[0,-29,-1.55],[16,-23,-.95],[25,-11,-.32]]
      : [[-23,-19,-2.2],[-7,-29,-1.77],[12,-26,-1.08],[25,-13,-.46]];
  // Each branch carries alternating paired leaves and a terminal leaf.
  for(let i=0;i<sprays.length;i++) {
    const [tx,ty,a]=sprays[i];
    c.strokeStyle=p.ink; c.lineWidth=style==='animation'?2.8:1.7;
    c.beginPath(); c.moveTo(i%2?3:-4,1); c.quadraticCurveTo(tx*.6,-10,tx,ty); c.stroke();
    const count=style==='botanical'?4:style==='leafyAiry'?1:3;
    for(let j=0;j<count;j++) {
      const t=style==='leafyAiry'?.48+j*.28:.4+j*.19, bx=tx*t, by=ty*t;
      const len=style==='botanical'?10+j*.9:style==='leafyAiry'?25:style==='leafyDusky'?12+j:isLeafy(style)?14+j:16+j;
      const spread=style==='leafyDusky'?1.25:.78;
      inkLeaf(c,bx,by,len,a-spread,j%2?p.light:p.mid,style);
      inkLeaf(c,bx,by,len*.92,a+spread+.07,j%2?p.mid:p.light,style);
    }
    inkLeaf(c,tx*.89,ty*.89,style==='botanical'?13:style==='leafyAiry'?22:style==='leafyDusky'?12:16,a,p.light,style);
  }
  // Layered lower leaves remove gaps around the stems without alpha blending.
  const lowerCount=style==='leafyAiry'?4:style==='leafyBloom'?5:6;
  for(let i=0;i<lowerCount;i++) {
    const lx=-29+i*(style==='leafyAiry'||style==='leafyBloom'?58/(lowerCount-1):10);
    const len=style==='leafyAiry'?23:style==='leafyBloom'?24:style==='botanical'?12:15;
    const angle=style==='leafyBloom'?-2.9+i*.62:style==='leafyDusky'?-1.8+(i%2)*.55:-1.9+(i%3)*.9;
    inkLeaf(c,lx,-3-(i%2)*4,len,angle,i%2?p.mid:p.light,style);
  }
  if(style==='leafyBloom') {
    // A second, readable fan of broad leaves, with just two small blossom clusters.
    for(const [lx,ly,a] of [[-20,-11,-2.5],[-6,-17,-1.8],[12,-13,-.8]]) {
      inkLeaf(c,lx,ly,18,a,p.light,style);
    }
    for(const [bx,by] of [[-20,-24],[19,-19]]) {
      for(let i=0;i<5;i++) {
        const a=i*TAU/5;
        oval(c,bx+Math.cos(a)*3.5,by+Math.sin(a)*3.5,3,2.2,'#dfb6ac',a);
      }
      oval(c,bx,by,1.5,1.5,'#eee0ad');
    }
  }
  if(style==='leafy') {
    for(const [bx,by] of [[-22,-14],[10,-21],[22,-7]]) {
      oval(c,bx,by,2.5,2.7,'#d78066'); c.strokeStyle=p.ink; c.lineWidth=1;
      c.beginPath(); c.arc(bx,by,2.6,0,TAU); c.stroke(); oval(c,bx-.7,by-.9,.7,.7,'#ffe0a4');
    }
  }
  if(style==='animation' && fg) {
    for(const [bx,by] of [[-16,-24],[18,-16]]) {
      c.strokeStyle=p.tip; c.lineWidth=2; c.beginPath(); c.moveTo(bx,by); c.lineTo(bx+3,by-3); c.stroke();
    }
  }
  c.restore();
}

function extrudedPlatform(c: Ctx2D, p: Platform, ground: boolean, style: LeafStyle) {
  const q=palettes[style], {x,y,width:w,height:h}=p;
  c.save(); c.lineJoin='round'; c.lineCap='round'; c.strokeStyle=q.ink; c.lineWidth=q.width;
  if(p.style==='stump') {
    c.fillStyle=q.earth; c.beginPath(); c.moveTo(x,y); c.lineTo(x+w,y);
    c.lineTo(x+w-2,y+h-8); c.lineTo(x+w+3,y+h); c.lineTo(x-3,y+h); c.lineTo(x+2,y+h-9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle=q.side; c.beginPath(); c.moveTo(x+w-9,y+2); c.lineTo(x+w,y);
    c.lineTo(x+w-2,y+h-8); c.lineTo(x+w+3,y+h); c.lineTo(x+w-8,y+h); c.closePath(); c.fill();
    for(let i=0;i<5;i++) {
      const bx=x+6+i*(w-13)/5; c.strokeStyle=i%2?q.earthLight:q.ink; c.lineWidth=style==='animation'?2:1.2;
      c.beginPath(); c.moveTo(bx,y+7); c.bezierCurveTo(bx-3,y+h*.4,bx+3,y+h*.65,bx-1,y+h-3); c.stroke();
    }
    oval(c,x+w/2,y,w/2,8,q.earthLight);
    c.strokeStyle=q.ink; c.lineWidth=q.width; c.beginPath(); c.ellipse(x+w/2,y,w/2,8,0,0,TAU); c.stroke();
    c.lineWidth=style==='animation'?1.3:.8;
    for(let i=1;i<=3;i++){c.beginPath();c.ellipse(x+w*.49,y,w*.12*i,1.7*i,0,0,TAU);c.stroke();}
    inkLeaf(c,x+3,y+h-1,10,-.9,q.mid,style); inkLeaf(c,x+w-6,y+h,9,-2,q.light,style);
    c.restore(); return;
  }
  // Original Meadow depth: cap spans y +/- 8; back edge is skewed 8px right.
  // The collision plane remains the middle of this cap at exactly p.y.
  c.fillStyle=q.side; c.beginPath(); c.moveTo(x+w,y+8); c.lineTo(x+w+8,y-8);
  c.lineTo(x+w+8,y+h-16); c.lineTo(x+w,y+h); c.closePath(); c.fill(); c.stroke();
  c.fillStyle=q.earth; c.beginPath(); c.rect(x,y+8,w,h-8); c.fill(); c.stroke();
  c.fillStyle=q.side; c.fillRect(x,y+h-4,w,4);
  if(style==='animation') {
    c.fillStyle=q.earthLight; c.beginPath(); c.moveTo(x+3,y+12); c.lineTo(x+w-3,y+12);
    c.lineTo(x+w-7,y+17); c.lineTo(x+w*.63,y+16); c.lineTo(x+w*.42,y+20); c.lineTo(x+3,y+17); c.closePath(); c.fill();
  } else {
    c.strokeStyle=q.earthLight; c.lineWidth=isLeafy(style)?2.6:1;
    c.beginPath(); c.moveTo(x+3,y+15); c.bezierCurveTo(x+w*.3,y+11,x+w*.6,y+20,x+w-3,y+15); c.stroke();
  }
  const stoneSpacing=style==='leafyAiry'?65:style==='leafyDusky'?42:25;
  for(let i=0;i<Math.floor(w/stoneSpacing);i++) {
    const px=x+13+i*stoneSpacing, py=y+18+(i*7%Math.max(1,h-22));
    oval(c,px,py,style==='animation'?3.7:2.4,1.2,q.earthLight,-.25);
    if(style==='botanical'){ c.strokeStyle=q.ink; c.lineWidth=.7; c.beginPath(); c.moveTo(px-4,py+2); c.lineTo(px,py+1); c.stroke(); }
  }
  c.fillStyle=q.cap; c.strokeStyle=q.ink; c.lineWidth=q.width;
  c.beginPath(); c.moveTo(x,y+8); c.lineTo(x+8,y-8);
  const n=Math.max(3,Math.ceil(w/(style==='leafyAiry'?45:style==='leafyBloom'?18:26)));
  for(let i=0;i<n;i++) {
    const a=x+8+i*w/n, b=x+8+(i+1)*w/n;
    c.bezierCurveTo(a+w/n*.3,y-11,b-w/n*.2,y-9,b,y-8);
  }
  c.lineTo(x+w,y+8);
  for(let i=n;i>0;i--) {
    const a=x+i*w/n,b=x+(i-1)*w/n;
    c.bezierCurveTo(a-w/n*.2,y+11,b+w/n*.25,y+12,b,y+8);
  }
  c.closePath(); c.fill(); c.stroke();
  // A restrained center-plane highlight retains the legible landing level.
  c.strokeStyle=q.tip; c.lineWidth=style==='animation'?2:1;
  c.beginPath(); c.moveTo(x+7,y); c.lineTo(x+w-3,y); c.stroke();
  const grassSpacing=style==='leafyAiry'?42:21;
  for(let i=0;i<Math.floor(w/grassSpacing);i++) {
    const px=x+13+i*grassSpacing; c.strokeStyle=q.mid; c.lineWidth=style==='animation'?1.7:1;
    c.beginPath(); c.moveTo(px-2,y+4); c.lineTo(px,y+1); c.lineTo(px+2,y+4); c.stroke();
    if(style==='leafyBloom' && i%3===1) {
      oval(c,px+5,y+2,2,1.4,'#dfb6ac');
    }
    if(style==='leafyDusky') {
      // Small paired eucalyptus marks echo the upright bush rhythm.
      oval(c,px-3,y+2,2.5,1.2,q.light,-.5);
      oval(c,px+3,y+2,2.5,1.2,q.light,.5);
    }
  }
  if(!ground) {
    c.strokeStyle=q.ink; c.lineWidth=1.3;
    for(let i=0;i<3;i++){const rx=x+w*(.19+i*.3);c.beginPath();c.moveTo(rx,y+h);c.quadraticCurveTo(rx-4,y+h+3,rx+1,y+h+6-i);c.stroke();}
  }
  c.restore();
}

function studyFlower(c: Ctx2D,x: number,y: number,color: string,h: number,style: LeafStyle) {
  if(style==='botanical'){flower(c,x,y,color,h,true);return;}
  const p=palettes[style]; c.save(); c.strokeStyle=p.ink; c.lineWidth=p.width;
  const petal=style==='leafyAiry'?'#ede5c3':style==='leafyBloom'?'#dfb6ac':style==='leafyDusky'?'#e3c8ac':color;
  c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-3,y-h*.5,x,y-h);c.stroke();
  inkLeaf(c,x,y-h*.25,style==='animation'?9:8,-2.5,p.mid,style);
  inkLeaf(c,x-1,y-h*.5,8,-.6,p.light,style);
  const count=style==='animation'?5:8, r=style==='animation'?5:4;
  for(let i=0;i<count;i++) {
    const a=i*TAU/count; oval(c,x+Math.cos(a)*r,y-h+Math.sin(a)*r,r*.85,r*.6,petal,a);
    c.strokeStyle=p.ink;c.lineWidth=style==='animation'?1.3:.8;
    c.beginPath();c.ellipse(x+Math.cos(a)*r,y-h+Math.sin(a)*r,r*.85,r*.6,a,0,TAU);c.stroke();
  }
  oval(c,x,y-h,2.7,2.7,'#f6cf68');c.restore();
}
function studyMushroom(c: Ctx2D,x: number,y: number,style: LeafStyle) {
  const p=palettes[style]; c.save(); c.translate(x,y); c.strokeStyle=p.ink;c.lineWidth=p.width;
  c.fillStyle='#eddbad';c.beginPath();c.moveTo(-2,-12);c.lineTo(3,-12);c.lineTo(4,0);c.quadraticCurveTo(0,2,-3,0);c.closePath();c.fill();c.stroke();
  c.fillStyle=style==='botanical'?'#b88858':style==='leafyAiry'?'#c09a78':style==='leafyBloom'?'#be8170':style==='leafyDusky'?'#c49783':style==='leafy'?'#c4775b':'#e68b55';
  c.beginPath();c.moveTo(-10,-11);
  if(style==='botanical') {c.quadraticCurveTo(-4,-23,1,-23);c.quadraticCurveTo(7,-18,10,-11);}
  else {c.bezierCurveTo(-9,-24,9,-24,11,-11);}
  c.quadraticCurveTo(0,-7,-10,-11);c.closePath();c.fill();c.stroke();
  if(style==='botanical') {
    for(let i=-6;i<=6;i+=3){c.lineWidth=.7;c.beginPath();c.moveTo(i,-11);c.lineTo(i*.55,-17-Math.abs(i)*.2);c.stroke();}
  } else {
    for(const [px,py,r] of [[-4,-15,2.2],[3,-17,2.7],[7,-12,1.3]]) oval(c,px,py,r,r*.65,'#fff0c6');
  }
  c.restore();
}
function makeLeafStudy(style: LeafStyle,name: string,summary: string): PropStudy {
  return { name,summary,
    drawBush:(c,x,y,s,f)=>branchingBush(c,x,y,s,f,style),
    drawFlower:(c,x,y,color,h=22)=>studyFlower(c,x,y,color,h,style),
    drawMushroom:(c,x,y)=>studyMushroom(c,x,y,style),
    drawPlatform:(c,p,g)=>extrudedPlatform(c,p,g,style),
  };
}

export const studies: Record<'storybook' | 'woodcut' | LeafStyle, PropStudy> = {
  botanical: makeLeafStudy('botanical', 'Botanical ink', 'Fine outlined pointed leaf sprays, visible branching, amber field mushrooms and etched earthen ledges.'),
  leafy: makeLeafStudy('leafy', 'Leafy storybook', 'Broad rounded leaves on spreading branches, coral berries, daisy rosettes and warm terracotta ledges.'),
  leafyAiry: makeLeafStudy('leafyAiry', 'Leafy airy', 'Larger spaced sage leaves, gentle ink, cream daisies and quiet sandy ledges.'),
  leafyBloom: makeLeafStudy('leafyBloom', 'Leafy bloom', 'Layered rounded foliage with two dusty rose blossom clusters, matching flowers and warm earthen ledges.'),
  leafyDusky: makeLeafStudy('leafyDusky', 'Leafy dusky', 'Cool eucalyptus leaves with pale readable edges, cream flowers and contrasting warm clay ledges.'),
  animation: makeLeafStudy('animation', 'Bold animation', 'Large graphic leaves, strong dark contours, bright lime planes and chunky golden soil accents.'),
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
