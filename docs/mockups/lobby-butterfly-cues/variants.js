import {drawRoundedButterfly} from '../../../src/engine/rendering/roundedButterfly.ts';
import {drawWildlife} from '../../../src/engine/rendering/particles.ts';
export function flightAt(t){
 return Array.from({length:6},(_,i)=>{
  const butterfly=i<4,vx=butterfly?16+i*4:45+(i-4)*25;
  return {type:butterfly?'butterfly':'bird',x:(130+i*173+vx*t)%1280,y:butterfly?200+i*99+Math.sin(t*2+i)*20:80+(i-4)*45,vx,vy:0,wingPhase:t*11+i,color:butterfly?['#FFD700','#FF69B4','#87CEEB','#DDA0DD'][i]:'#444'};
 });
}
export function drawCue(c,flight,variant,size=1){
 for(const w of flight){
  if(w.type==='bird'){drawWildlife(c,[w]);continue;}
  if(variant===3)continue;
  if(variant===1){drawRoundedButterfly(c,w,size);continue;}
  c.save();c.translate(w.x,w.y);c.scale(size,size);
  if(variant===0){drawWildlife(c,[{...w,x:0,y:0}]);c.restore();continue;}
  const width=.52+.48*Math.abs(Math.sin(w.wingPhase));
  c.fillStyle=w.color;c.strokeStyle='#543b40';c.lineWidth=.65;
  for(const dir of [-1,1]){
   c.save();c.scale(dir*width,1);
   c.beginPath();c.moveTo(0,1);c.bezierCurveTo(1,-5,7,-7,7,-3);
   c.quadraticCurveTo(7,0,4,1);c.quadraticCurveTo(5,4,2,4);c.quadraticCurveTo(0,4,0,1);
   c.fill();c.stroke();
   if(variant===2){c.fillStyle='#fff0cb';c.beginPath();c.arc(4,-2.8,1,0,Math.PI*2);c.fill();c.fillStyle=w.color;}
   c.restore();
  }
  c.fillStyle='#543b40';c.fillRect(-.55,-2,1.1,5);
  c.restore();
 }
}
