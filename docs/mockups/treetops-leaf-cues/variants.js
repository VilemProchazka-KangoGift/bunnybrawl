import {drawWeather} from '../../../src/engine/rendering/particles.ts';
export function weatherAt(t){
 return Array.from({length:35},(_,i)=>{
  const leaf=i<25,vx=leaf?(i*11)%31-15:(i*11)%21-10,vy=leaf?15+(i*7)%26:10+(i*7)%16,rotSpeed=leaf?1+i%4:2+i%4;
  return {type:leaf?'leaf':'petal',x:((97+i*173+vx*t)%1280+1280)%1280,y:(77+i*97+vy*t)%720,vx,vy,size:leaf?3+i%5:2+i%3,rotation:i*.71+t*rotSpeed,rotSpeed};
 });
}
export function drawCue(c,weather,variant,theme){
 for(const w of weather){
  if(w.type!=='leaf'||variant===0){drawWeather(c,[w],theme);continue;}
  if(variant===3)continue;
  
  c.save();c.translate(w.x,w.y);c.rotate(w.rotation);const r=w.size;
  c.fillStyle=variant===1?'rgba(144,181,83,.76)':'rgba(179,126,66,.77)';
  c.beginPath();c.moveTo(-r,0);
  if(variant===1){
   c.lineTo(-r*.69,-r*.38);c.lineTo(-r*.36,-r*.33);c.lineTo(-r*.09,-r*.62);
   c.lineTo(r*.23,-r*.46);c.lineTo(r,0);c.quadraticCurveTo(r*.04,r*.88,-r,0);
  }else{
   c.bezierCurveTo(-r*.27,-r*.95,r*.58,-r*.5,r,.18);c.quadraticCurveTo(r*.33,r*.56,-r,0);
  }
  c.closePath();c.fill();
  c.strokeStyle='rgba(245,213,147,.78)';c.lineWidth=r*.13;c.beginPath();c.moveTo(-r*.78,0);c.quadraticCurveTo(0,-r*.12,r*.72,r*.05);c.stroke();c.restore();
 }
}
