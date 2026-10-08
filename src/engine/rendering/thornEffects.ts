import type { Ctx2D, Particle } from '../types';

export function drawThornJolt(ctx: Ctx2D, p: Particle, lead = 0): void {
 const age = Math.max(0, p.maxLife - p.life + lead);
 if (age >= p.maxLife) return;
 ctx.save();ctx.translate(p.x,p.y+19*(p.size/22));ctx.scale(p.size/22,p.size/22);
 if(age<.42)drawThornImpact(ctx,age,1);
 const t=age/.48;
 for(let i=0;i<14;i++){
  const a=-Math.PI+.12+i*Math.PI*.94/13,speed=55+(i%5)*23;
  ctx.save();ctx.globalAlpha*=1-t*t;
  thornShard(ctx,Math.cos(a)*speed*age,-8+Math.sin(a)*speed*age+80*age*age,5+(i%4),a+age*(i%2?3:-3),i%3===0?'#FFF0CB':i%3===1?'#C54B38':'#8B593C');ctx.restore();
 }
 ctx.restore();
}
function thornShard(ctx: Ctx2D, x: number, y: number, size: number, angle: number, color: string){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.strokeStyle='#665344';ctx.lineWidth=.65;
 ctx.beginPath();ctx.moveTo(-size*.25,size*.35);ctx.lineTo(size,-size*.1);ctx.lineTo(-size*.4,-size*.35);ctx.lineTo(-size*.2,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function drawThornImpact(ctx: Ctx2D, age: number, index: number){
 const t=age/.42;
 ctx.save();ctx.translate(0,-19);
 const radius=(index===2?28:index===3?32:22)*(1+.35*t);
 ctx.globalAlpha*=(1-t*t)*.95;ctx.strokeStyle='#664537';ctx.lineWidth=1.1;ctx.lineJoin='round';
 ctx.fillStyle=index===2?'#C8583D':'#FFF0CB';ctx.beginPath();
 for(let i=0;i<24;i++){const a=i*Math.PI/12,r=radius*(i%2?.45:.85+(i%5)*.065);const x=Math.cos(a)*r,y=Math.sin(a)*r*.88;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle=index===2?'#FFF0CB':'#CB5940';ctx.beginPath();
 for(let i=0;i<16;i++){const a=i*Math.PI/8,r=radius*(i%2?.24:.58);if(i===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();
 // Uneven ink hatching keeps the burst from reading as a clean vector star.
 ctx.strokeStyle='#965F42';ctx.lineWidth=.7;
 for(let i=0;i<9;i++){const a=i*.72,r=radius*.7;ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r*.88);ctx.lineTo(Math.cos(a+.025)*(r-5),Math.sin(a+.025)*(r-5)*.88);ctx.stroke()}

 ctx.restore();
}
