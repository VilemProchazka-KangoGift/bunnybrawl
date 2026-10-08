import type { Ctx2D, Particle } from '../types';

/** Stationary reveal clouds with eight small gold/orange flecks. */
export function drawRespawnEntrance(ctx: Ctx2D, p: Particle, lead = 0): void {
 const age=Math.max(0,p.maxLife-p.life+lead);if(age>=.85)return;
 ctx.save();ctx.translate(p.x,p.y+16*p.size);ctx.scale(p.size,p.size);
 if(age<.55){const t=age/.55;ctx.save();ctx.globalAlpha*=1-t*t;
  spawnCloud(ctx,-15-30*t,-8+4*t,21+4*t);
  spawnCloud(ctx,14+32*t,-9+5*t,24+3*t);
  spawnCloud(ctx,-1,-17+11*t,20*(1-t));ctx.restore();
 }
 for(let i=0;i<8;i++){
  const life=.55+(i%4)*.09;if(age>=life)continue;
  const sign=i%2?-1:1,vx=sign*(18+(i%4)*12),vy=-95-(i%3)*18;
  ctx.save();ctx.translate(vx*age,-12+vy*age+180*age*age);ctx.rotate(i*.7+age*sign*5);
  ctx.globalAlpha*=age<life*.55?.95:(life-age)/(life*.45)*.95;
  ctx.fillStyle=i%2?'#E4A24B':'#FFD478';ctx.beginPath();ctx.ellipse(0,0,2.2,3.2,0,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 ctx.restore();
}
function spawnCloud(ctx: Ctx2D, x: number, y: number, r: number){ctx.fillStyle='#FFF0DC';ctx.strokeStyle='#776049';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(x-r,y+2);ctx.bezierCurveTo(x-r*1.3,y-r*.4,x-r*.5,y-r*.65,x-r*.35,y-r*.45);ctx.bezierCurveTo(x-r*.15,y-r,x+r*.45,y-r*.85,x+r*.52,y-r*.4);ctx.bezierCurveTo(x+r*1.3,y-r*.48,x+r*1.2,y+r*.3,x+r*.65,y+r*.32);ctx.bezierCurveTo(x+r*.1,y+r*.55,x-r*.8,y+r*.4,x-r,y+2);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#D2B995';ctx.beginPath();ctx.moveTo(x-r*.5,y);ctx.quadraticCurveTo(x,y-r*.35,x+r*.35,y-r*.1);ctx.stroke();}
