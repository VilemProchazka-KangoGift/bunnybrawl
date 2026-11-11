import {drawAmberComet} from '../../../src/engine/rendering/amberComet.ts';
export function weatherAt(t){
 const wrap=(x,m)=>((x%m)+m)%m;
 return Array.from({length:15},(_,i)=>{
  const ember=i<6,vx=ember?(i*7)%11-5:(i*7)%17-8,vy=ember?-5-(i*9)%11:-10-(i*9)%16,rotSpeed=(i%5)*(ember?.125:.25);
  return {type:ember?'ember':'spark',x:wrap(97+i*173+vx*t,1280),y:wrap(77+i*97+vy*t,720),vx,vy,size:1+i%(ember?2:3),rotation:i*.71+t*rotSpeed,rotSpeed,color:ember?'#FFAA00':'#00CCFF'};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type==='spark'){theme.drawWeatherParticle(c,w);continue;}
  if(variant===0){c.save();c.globalAlpha=.6;c.fillStyle=w.color||'#FFAA00';c.beginPath();c.arc(w.x,w.y,w.size,0,Math.PI*2);c.fill();c.restore();continue;}
  if(variant===1){drawAmberComet(c,w);continue;}
  if(variant===3)continue;
  c.save();c.translate(w.x,w.y);const r=w.size;
  c.rotate(Math.atan2(w.vy,w.vx));
  const tail=r*(variant===1?3.6:5);
  const g=c.createLinearGradient(-tail,0,0,0);
  g.addColorStop(0,'transparent');
  g.addColorStop(1,variant===1?'#ffaf54':'#b5eaff');
  c.fillStyle=g;c.beginPath();c.moveTo(-tail,0);
  c.quadraticCurveTo(-r,-r*.6,0,-r*.48);
  c.lineTo(0,r*.48);c.quadraticCurveTo(-r,r*.6,-tail,0);c.fill();
  c.fillStyle=variant===1?'#fff0af':'#eafaff';
  c.beginPath();c.arc(0,0,r*.62,0,Math.PI*2);c.fill();
  c.restore();
 }
}
