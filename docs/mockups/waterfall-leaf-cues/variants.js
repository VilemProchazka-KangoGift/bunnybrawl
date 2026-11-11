import {drawWeather} from '../../../src/engine/rendering/particles.ts';
export function weatherAt(t){
 return Array.from({length:14},(_,i)=>{
  const vx=8+(i*11)%18,vy=12+(i*7)%19,rotSpeed=1+i%3;
  return {type:'leaf',x:((97+i*173+vx*t)%1280+1280)%1280,y:(77+i*97+vy*t)%720,vx,vy,size:3+i%3,rotation:i*.71+t*rotSpeed,rotSpeed};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type!=='leaf'||variant===0){drawWeather(c,[w],theme);continue;}
  if(variant===3)continue;
  
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  c.fillStyle=variant===1?'rgba(112,174,127,.76)':'rgba(79,139,98,.82)';
  c.beginPath();c.moveTo(-r,0);
  if(variant===1){
   c.lineTo(-r*.69,-r*.38);c.lineTo(-r*.36,-r*.33);c.lineTo(-r*.09,-r*.62);
   c.lineTo(r*.23,-r*.46);c.lineTo(r,0);c.quadraticCurveTo(r*.04,r*.88,-r,0);
  }else{
   c.bezierCurveTo(-r*.27,-r*.95,r*.58,-r*.5,r,.18);c.quadraticCurveTo(r*.33,r*.56,-r,0);
  }
  c.closePath();c.fill();
  c.strokeStyle='rgba(194,227,164,.78)';c.lineWidth=r*.13;c.beginPath();c.moveTo(-r*.78,0);c.quadraticCurveTo(0,-r*.12,r*.72,r*.05);c.stroke();c.restore();
 }
}
