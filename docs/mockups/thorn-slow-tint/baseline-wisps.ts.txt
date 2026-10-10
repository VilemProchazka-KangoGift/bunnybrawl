import type { Ctx2D, Particle } from '../types';
import { THORN_SLOW_DURATION } from '../constants';

function ember(ctx: Ctx2D,x: number,y: number,r: number,a=0){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle='#F28B39';ctx.strokeStyle='#74452E';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.7,-r*.15);ctx.lineTo(r*.4,r*.7);ctx.lineTo(-r*.55,r*.4);ctx.lineTo(-r*.8,-r*.2);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#FFDD87';ctx.beginPath();ctx.moveTo(0,-r*.65);ctx.lineTo(r*.35,0);ctx.lineTo(-r*.3,r*.15);ctx.closePath();ctx.fill();ctx.restore();}
function smoke(ctx: Ctx2D,x: number,y: number,r: number,alpha: number){ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle='#B0A08A';ctx.strokeStyle='#756557';ctx.lineWidth=.85;ctx.beginPath();ctx.moveTo(x-r,y+2);ctx.bezierCurveTo(x-r*1.3,y-r*.5,x-r*.6,y-r*.8,x-r*.3,y-r*.5);ctx.bezierCurveTo(x,y-r*1.2,x+r*.6,y-r*.8,x+r*.55,y-r*.3);ctx.bezierCurveTo(x+r*1.3,y-r*.1,x+r,y+r*.5,x+r*.3,y+r*.45);ctx.bezierCurveTo(x-r*.4,y+r*.65,x-r,y+r*.5,x-r,y+2);ctx.fill();ctx.stroke();ctx.strokeStyle='#D1C1AA';ctx.beginPath();ctx.moveTo(x-r*.5,y);ctx.quadraticCurveTo(x-r*.2,y-r*.4,x+r*.2,y-r*.2);ctx.stroke();ctx.restore();}

/** Two short smoke chuffs, anchored to the hit rather than the moving body. */
export function drawBurnCough(ctx: Ctx2D, p: Particle, lead = 0): void {
 const age=Math.max(0,p.maxLife-p.life+lead);
 ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.size,p.size);
 for(let beat=0;beat<2;beat++){
  const t=age-beat*.15;if(t<0||t>.44)continue;const u=t/.44;
  for(const sign of [-1,1]){
   ctx.save();ctx.translate(sign*(12+24*u),-12-15*u);
   smoke(ctx,0,0,14+4*u,1-u*u);ctx.globalAlpha*=1-u;
   ember(ctx,sign*3,-2,5-u*2,sign*u*3);ctx.restore();
  }
  for(let i=0;i<4;i++){ctx.save();ctx.globalAlpha*=1-u;ember(ctx,(i-1.5)*(8+20*u),-17-30*u,3,i+u*3);ctx.restore();}
 }
 ctx.restore();
}
/** A quiet wisp follows the burning player until the gameplay timer expires. */
export function drawBurnWisps(ctx: Ctx2D,x: number,y: number,scale: number,burn: number): void {
 if(burn<=0)return;
 const age=Math.max(0,THORN_SLOW_DURATION-burn),t=age%1.4;
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
 smoke(ctx,7*Math.sin(t*3),-19-28*t,4+5*t,Math.min(1,burn)*.4*(1-t/1.4));ctx.restore();
}
